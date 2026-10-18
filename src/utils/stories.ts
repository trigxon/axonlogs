/* ------------------------------------------------------------------
 * Axon Stories — Instagram-style 24h stories backend client.
 *
 * All authorization is SERVER-ENFORCED (supabase/schema.sql SECTION 6):
 *   • expiry  → stories SELECT policy filters expires_at > now()
 *   • audience → can_view_story(owner, audience, viewer) in RLS
 *   • close friends → close_friends table, checked in RLS
 *   • story media → private `story_media` bucket, path
 *       story_media/{username}/{audience}/{file} with a matching
 *       storage policy (same can_view_story check).
 * The client can only ever see what the server allows it to see.
 * ------------------------------------------------------------------ */

export interface StoryOverlay {
  text: string;
  x: number; // 0..1 relative
  y: number; // 0..1 relative
  size: number; // px at 1080-width basis (scaled by viewer)
  color: string;
}

export interface Story {
  id: string;
  username: string;
  media_path: string;
  media_type: 'image' | 'video';
  caption: string;
  overlays: StoryOverlay[];
  audience: 'followers' | 'close_friends';
  created_at: string;
  expires_at: string;
}

export interface StoryViewRow {
  id: string;
  story_id: string;
  viewer: string;
  reaction: string | null;
  viewed_at: string;
}

export interface Highlight {
  id: string;
  username: string;
  title: string;
  cover_path: string;
  sort_order: number;
  created_at: string;
  /** hydrated client-side */
  stories?: Story[];
}

export interface StoryTrayEntry {
  username: string;
  stories: Story[];
  /** true when I haven't watched the latest one yet */
  unseen: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------ upload ------------------------------ */

const extOf = (mime: string, fallback = 'bin'): string => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };
  return map[mime] || fallback;
};

/** 10MB story size ceiling (Instagram-like) — validated BEFORE upload. */
export const MAX_STORY_BYTES = 10 * 1024 * 1024;
export const ALLOWED_STORY_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];

export const validateStoryFile = (file: File): string | null => {
  if (!ALLOWED_STORY_TYPES.includes(file.type)) return "That file type isn't supported. Use a photo or a video.";
  if (file.size > MAX_STORY_BYTES) return 'That file is too large — keep stories under 10MB.';
  return null;
};

/**
 * Upload story media to the private bucket under
 * story_media/{username}/{audience}/{uuid}.{ext} — the storage policy
 * derives visibility from those first two path segments.
 */
export const uploadStoryMedia = async (
  supabase: any,
  username: string,
  audience: 'followers' | 'close_friends',
  file: File
): Promise<{ ok: true; path: string; type: 'image' | 'video' } | { ok: false; error: string }> => {
  if (!supabase) return { ok: false, error: 'No database connection.' };
  const invalid = validateStoryFile(file);
  if (invalid) return { ok: false, error: invalid };
  const u = username.trim().toLowerCase();
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  const path = `story_media/${u}/${audience}/${crypto.randomUUID()}.${extOf(file.type)}`;
  const { error } = await supabase.storage.from('story_media').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message || 'Upload failed.' };
  return { ok: true, path, type: kind };
};

export const createStory = async (
  supabase: any,
  story: {
    username: string;
    media_path: string;
    media_type: 'image' | 'video';
    caption?: string;
    overlays?: StoryOverlay[];
    audience: 'followers' | 'close_friends';
  }
): Promise<{ ok: true; story: Story } | { ok: false; error: string }> => {
  if (!supabase) return { ok: false, error: 'No database connection.' };
  const u = story.username.trim().toLowerCase();
  const { data, error } = await supabase
    .from('stories')
    .insert({
      username: u,
      media_path: story.media_path,
      media_type: story.media_type,
      caption: story.caption || '',
      overlays: story.overlays || [],
      audience: story.audience,
    })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message || 'Could not share your story.' };
  return { ok: true, story: data as Story };
};

export const deleteStory = async (supabase: any, storyId: string): Promise<boolean> => {
  const { error } = await supabase.from('stories').delete().eq('id', storyId);
  return !error;
};

/* ------------------------------ reading ------------------------------ */

/** Signed URL for private story media (1h, cached in-memory). */
const signedUrlCache = new Map<string, { url: string; until: number }>();

export const storyMediaUrl = async (supabase: any, path: string): Promise<string | null> => {
  if (!supabase || !path) return null;
  const hit = signedUrlCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from('story_media').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(path, { url: data.signedUrl, until: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
};

/** All unexpired stories of one user (RLS filters what I may not see). */
export const fetchUserStories = async (supabase: any, username: string): Promise<Story[]> => {
  if (!supabase) return [];
  const u = username.trim().toLowerCase();
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('username', u)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return [];
  return (data || []) as Story[];
};

/**
 * Story tray feed: my stories + the people I follow, grouped per user,
 * each entry flagged unseen when my viewer row is missing for the
 * newest story. (RLS already removes anything I can't view.)
 */
export const fetchStoryTray = async (
  supabase: any,
  me: string,
  following: string[]
): Promise<StoryTrayEntry[]> => {
  if (!supabase) return [];
  const u = me.trim().toLowerCase();
  const authors = [...new Set([u, ...following.map(x => x.trim().toLowerCase())])];
  const { data, error } = await supabase
    .from('stories')
    .select('id, username, viewed_at:story_views(viewer), created_at, expires_at')
    .in('username', authors)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  // hydrate full rows (the compact select above keeps the payload small;
  // refetch the visible set fully for the viewer)
  const { data: full, error: fullErr } = await supabase
    .from('stories')
    .select('*')
    .in('username', authors)
    .order('created_at', { ascending: true })
    .limit(300);
  if (fullErr || !full) return [];
  const stories = full as Story[];
  const viewedByMe = new Set(
    (data || [])
      .filter((r: any) => (r.viewed_at || []).some((v: any) => v.viewer === u))
      .map((r: any) => r.id)
  );
  const byUser = new Map<string, Story[]>();
  for (const s of stories) {
    const list = byUser.get(s.username) || [];
    list.push(s);
    byUser.set(s.username, list);
  }
  const entries: StoryTrayEntry[] = [];
  for (const [author, list] of byUser) {
    if (list.length === 0) continue;
    entries.push({
      username: author,
      stories: list.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      unseen: !viewedByMe.has(list[list.length - 1].id),
    });
  }
  // My story first, then unseen, then seen — Instagram tray order.
  entries.sort((a, b) => {
    if (a.username === u) return -1;
    if (b.username === u) return 1;
    if (a.unseen !== b.unseen) return a.unseen ? -1 : 1;
    return a.username.localeCompare(b.username);
  });
  return entries;
};

/* --------------------------- views & reactions --------------------------- */

/** Record my view (upsert; also refreshes viewed_at on rewatch). */
export const markStoryViewed = async (supabase: any, storyId: string, viewer: string): Promise<void> => {
  if (!supabase) return;
  await supabase
    .from('story_views')
    .upsert(
      { story_id: storyId, viewer: viewer.trim().toLowerCase() },
      { onConflict: 'story_id,viewer', ignoreDuplicates: false }
    );
};

/** Quick emoji reaction on a story (updates my viewer row). */
export const reactToStory = async (
  supabase: any,
  storyId: string,
  viewer: string,
  emoji: string
): Promise<boolean> => {
  if (!supabase) return false;
  const v = viewer.trim().toLowerCase();
  const { error } = await supabase
    .from('story_views')
    .upsert(
      { story_id: storyId, viewer: v, reaction: emoji },
      { onConflict: 'story_id,viewer', ignoreDuplicates: false }
    );
  if (error) return false;
  // Notify the story owner (actor = me, allowed by the insert policy).
  const { data: story } = await supabase.from('stories').select('username').eq('id', storyId).maybeSingle();
  if (story?.username && story.username !== v) {
    await supabase.from('notifications').insert({
      username: story.username,
      actor: v,
      type: 'story_reaction',
      payload: { story_id: storyId, emoji },
    });
  }
  return true;
};

/** Owner-only: who watched (and reacted to) this story. */
export const fetchStoryViewers = async (supabase: any, storyId: string): Promise<StoryViewRow[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('story_views')
    .select('id, story_id, viewer, reaction, viewed_at')
    .eq('story_id', storyId)
    .order('viewed_at', { ascending: false })
    .limit(200);
  if (error) return [];
  return (data || []) as StoryViewRow[];
};

/** Story reply = a DM message referencing the story (client wires the
 *  actual send through the CryptoContext engine, follow-gate applies).
 *  This records the notification so the owner sees "replied to your story". */
export const notifyStoryReply = async (
  supabase: any,
  storyId: string,
  owner: string,
  from: string
): Promise<void> => {
  if (!supabase) return;
  const a = from.trim().toLowerCase();
  if (owner.trim().toLowerCase() === a) return;
  await supabase.from('notifications').insert({
    username: owner.trim().toLowerCase(),
    actor: a,
    type: 'story_reply',
    payload: { story_id: storyId },
  });
};

/* ------------------------------ highlights ------------------------------ */

export const createHighlight = async (
  supabase: any,
  username: string,
  title: string,
  storyIds: string[],
  coverPath: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: 'No database connection.' };
  const u = username.trim().toLowerCase();
  const { data, error } = await supabase
    .from('highlights')
    .insert({ username: u, title: title.trim().slice(0, 30) || 'Highlights', cover_path: coverPath })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message || 'Could not create the highlight.' };
  if (storyIds.length > 0) {
    const rows = storyIds.slice(0, 20).map((story_id, i) => ({ highlight_id: data.id, story_id, position: i }));
    await supabase.from('highlight_stories').insert(rows);
  }
  return { ok: true };
};

export const fetchHighlights = async (supabase: any, username: string): Promise<Highlight[]> => {
  if (!supabase) return [];
  const u = username.trim().toLowerCase();
  const { data, error } = await supabase
    .from('highlights')
    .select('*')
    .eq('username', u)
    .order('sort_order', { ascending: true })
    .limit(20);
  if (error) return [];
  const highs = (data || []) as Highlight[];
  if (highs.length === 0) return highs;
  const { data: links } = await supabase
    .from('highlight_stories')
    .select('highlight_id, position, story:stories(*)')
    .in('highlight_id', highs.map(h => h.id))
    .order('position', { ascending: true });
  for (const h of highs) {
    h.stories = (links || [])
      .filter((l: any) => l.highlight_id === h.id && l.story)
      .map((l: any) => l.story as Story);
  }
  return highs;
};

export const deleteHighlight = async (supabase: any, highlightId: string): Promise<boolean> => {
  const { error } = await supabase.from('highlights').delete().eq('id', highlightId);
  return !error;
};

/* ------------------------------- close friends ------------------------------- */

export const fetchCloseFriends = async (supabase: any, me: string): Promise<string[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('close_friends')
    .select('member')
    .eq('owner', me.trim().toLowerCase())
    .limit(500);
  if (error) return [];
  return (data || []).map((r: any) => r.member as string);
};

export const setCloseFriend = async (supabase: any, me: string, member: string, add: boolean): Promise<boolean> => {
  if (!supabase) return false;
  const o = me.trim().toLowerCase();
  const m = member.trim().toLowerCase();
  if (add) {
    const { error } = await supabase.from('close_friends').upsert(
      { owner: o, member: m },
      { onConflict: 'owner,member', ignoreDuplicates: true }
    );
    return !error;
  }
  const { error } = await supabase.from('close_friends').delete().eq('owner', o).eq('member', m);
  return !error;
};

/* -------------------------------- helpers -------------------------------- */

export const storyAgeLabel = (createdAt: string): string => {
  const ms = Date.now() - new Date(createdAt).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) {
    const m = Math.max(1, Math.floor(ms / 60000));
    return `${m}h ago`.replace('h', 'm').replace('1m', '1m');
  }
  if (h < 24) return `${h}h`;
  return '1d+';
};

export const isStoryExpired = (s: Pick<Story, 'expires_at'>): boolean =>
  new Date(s.expires_at).getTime() <= Date.now();

export const STORY_TTL_MS = DAY_MS;
