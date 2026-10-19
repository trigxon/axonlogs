import CryptoJS from 'crypto-js';
import type { Chat, Message } from '../contexts/CryptoContext';

/* ------------------------------------------------------------------
 * AxonChat meta utilities — Instagram-style inbox intelligence.
 * Avatars, last-message previews, unread tracking, time formatting.
 * Everything stays client-side and E2EE-consistent: previews are only
 * ever decrypted in memory / cached encrypted-safe text.
 * ------------------------------------------------------------------ */

const aesDecrypt = (encrypted: string, key: string) => {
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    const text = bytes.toString(CryptoJS.enc.Utf8);
    return text || '';
  } catch {
    return '';
  }
};

/* ---------------------------- Avatars ----------------------------- */

// Deterministic gradient per chat/device id — cyan/emerald/violet family
// so every identity gets a unique look while honoring the Axon palette.
const GRADIENTS = [
  'linear-gradient(135deg, #22d3ee 0%, #0e7490 100%)', // cyan
  'linear-gradient(135deg, #34d399 0%, #065f46 100%)', // emerald
  'linear-gradient(135deg, #818cf8 0%, #3730a3 100%)', // indigo
  'linear-gradient(135deg, #f472b6 0%, #9d174d 100%)', // pink
  'linear-gradient(135deg, #fbbf24 0%, #92400e 100%)', // amber
  'linear-gradient(135deg, #60a5fa 0%, #1e3a8a 100%)', // blue
  'linear-gradient(135deg, #a78bfa 0%, #5b21b6 100%)', // violet
  'linear-gradient(135deg, #2dd4bf 0%, #115e59 100%)', // teal
];

export const avatarGradient = (seed: string): string => {
  if (!seed) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
};

export const initialsOf = (name: string): string => {
  const clean = (name || '?').trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s_\-.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
};

/* ------------------------- Time formatting ------------------------ */

export const formatChatTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
};

/* --------------------- Last-message previews ---------------------- */

export interface ChatPreview {
  text: string;
  at: string; // ISO timestamp
  senderId: string;
  hasAttachment?: boolean;
}

const PREVIEWS_KEY = 'axon_chat_previews';

export const readPreviewCache = (): Record<string, ChatPreview> => {
  try {
    return JSON.parse(localStorage.getItem(PREVIEWS_KEY) || '{}');
  } catch {
    return {};
  }
};

export const writePreview = (chatId: string, preview: ChatPreview) => {
  try {
    const map = readPreviewCache();
    map[chatId] = preview;
    localStorage.setItem(PREVIEWS_KEY, JSON.stringify(map));
  } catch {
    /* storage full / private mode */
  }
};

export const readCachedPreview = (chatId: string): ChatPreview | null => {
  const map = readPreviewCache();
  return map[chatId] || null;
};

/** Compose the visible one-liner for a decrypted message. */
export const previewFromMessage = (m: Message): ChatPreview => {
  const audioLike = m.text?.startsWith('data:audio/');
  let body: string;
  if (audioLike) body = 'Voice memo';
  else if (m.file_url) {
    try {
      const f = JSON.parse(m.file_url!);
      body = f?.name ? `Attachment — ${String(f.name).slice(0, 24)}` : 'Attachment';
    } catch {
      body = m.file_url.startsWith('data:image/') ? 'Photo' : 'Attachment';
    }
  } else body = (m.text || '').replace(/\s+/g, ' ').slice(0, 80);
  return { text: body, at: m.created_at, senderId: m.sender_id, hasAttachment: !!m.file_url || audioLike };
};

/**
 * Hydrate previews for every chat.
 * - LOCAL mode: messages live in localStorage (`axon_messages`) encrypted with
 *   the chat's share_code — decrypt the latest one per chat in-memory.
 * - ONLINE mode: fetch the latest message row per chat from Supabase.
 * Cached previews are kept so switching modes never blanks the inbox.
 */
export const hydratePreviews = async (
  chats: Chat[],
  mode: 'online' | 'local',
  supabase: any | null,
  username: string = ''
): Promise<Record<string, ChatPreview>> => {
  const map = readPreviewCache();

  if (mode === 'local') {
    const all = (() => {
      try {
        return JSON.parse(localStorage.getItem('axon_messages') || '[]') as Message[];
      } catch {
        return [] as Message[];
      }
    })();
    for (const chat of chats) {
      const msgs = all
        .filter(m => m.chat_id === chat.id && m.sender_id !== 'SYSTEM')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (msgs.length === 0) continue;
      const latest = msgs[0];
      const decrypted = latest.text
        ? latest.text.startsWith('data:audio/')
          ? 'data:audio/'
          : aesDecrypt(latest.text, chat.share_code)
        : '';
      if (latest.text && !latest.text.startsWith('data:audio/') && !decrypted) {
        // Undecryptable with this device's code — keep whatever cache says
        if (!map[chat.id]) map[chat.id] = { text: 'End-to-end encrypted', at: latest.created_at, senderId: latest.sender_id };
        continue;
      }
      map[chat.id] = previewFromMessage({ ...latest, text: decrypted });
    }
    localStorage.setItem(PREVIEWS_KEY, JSON.stringify(map));
    return map;
  }

  // ONLINE mode — one lightweight query per chat (personal-scale app: fine).
  // Phase 5 / S3: previews decrypt under the RESOLVED conversation key —
  // E2EE DMs unwrap on-device, legacy chats keep the share_code model.
  if (!supabase) return map;
  const { resolveChatKey } = await import('./chatCrypto');
  await Promise.all(
    chats.map(async chat => {
      try {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const latest = data[0] as Message;
          if (latest.sender_id === 'SYSTEM') return;
          const chatKey = await resolveChatKey(supabase, chat, username || '');
          const decrypted = latest.text ? aesDecrypt(latest.text, chatKey) : '';
          if (latest.text && !decrypted && !latest.file_url) {
            if (!map[chat.id]) map[chat.id] = { text: 'End-to-end encrypted', at: latest.created_at, senderId: latest.sender_id };
            return;
          }
          let fileUrl: string | null = null;
          if (latest.file_url) fileUrl = aesDecrypt(latest.file_url, chatKey) || null;
          map[chat.id] = previewFromMessage({ ...latest, text: decrypted, file_url: fileUrl });
        }
      } catch {
        /* keep cached preview */
      }
    })
  );
  localStorage.setItem(PREVIEWS_KEY, JSON.stringify(map));
  return map;
};

/* ------------------------ Unread tracking ------------------------- */

const READS_KEY = 'axon_chat_reads';

export const readLastReads = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(READS_KEY) || '{}');
  } catch {
    return {};
  }
};

/** Mark a chat fully read up to now (called while its feed is open & visible). */
export const markChatReadUpToNow = (chatId: string) => {
  try {
    const map = readLastReads();
    map[chatId] = new Date().toISOString();
    localStorage.setItem(READS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

export const isUnread = (chatId: string, preview: ChatPreview | null, selfId: string): boolean => {
  if (!preview) return false;
  if (preview.senderId === selfId || preview.senderId === 'SYSTEM') return false;
  const last = readLastReads()[chatId];
  if (!last) return true;
  return new Date(preview.at).getTime() > new Date(last).getTime();
};

/* ------------------------ Profile extras -------------------------- */

export const AVATAR_CHOICES = GRADIENTS;

export const getMyAvatar = (deviceId: string): string => {
  const saved = localStorage.getItem('axon_avatar_gradient');
  if (saved) return saved;
  return avatarGradient(deviceId);
};

export const setMyAvatar = (gradient: string) => {
  localStorage.setItem('axon_avatar_gradient', gradient);
};

export const getMyBio = (): string => localStorage.getItem('axon_bio') || '';
export const setMyBio = (bio: string) => localStorage.setItem('axon_bio', bio.slice(0, 80));

/* --------------------- Known-chat (inbox) filter ------------------- */

/**
 * Instagram-style privacy for the inbox: only show channels this device
 * actually created or joined (device keyring ∪ known list). The global
 * cloud directory stays reachable through search / join-by-code.
 */
export const readKnownChatIds = (): string[] => {
  try {
    const known = JSON.parse(localStorage.getItem('axon_known_chats') || '[]');
    const keys = JSON.parse(localStorage.getItem('axon_device_keys') || '{}');
    const ids = new Set<string>([...(Array.isArray(known) ? known : []), ...Object.keys(keys)]);
    return [...ids];
  } catch {
    return [];
  }
};

export const isKnownChatId = (chatId: string): boolean =>
  readKnownChatIds().includes(chatId);

/* ------------------ Per-chat Instagram options ------------------ */
/* Chat themes, nicknames, mute — all device-local (localStorage).   */

export interface ChatTheme {
  name: string;
  /** bubble background for MY messages (CSS background) */
  mine: string;
  /** accent for header/links/cta in this chat */
  accent: string;
}

export const CHAT_THEMES: ChatTheme[] = [
  { name: 'Default', mine: 'linear-gradient(135deg, #22d3ee 0%, #10b981 100%)', accent: '#22d3ee' },
  { name: 'Sunset', mine: 'linear-gradient(135deg, #fb7185 0%, #f59e0b 100%)', accent: '#fb7185' },
  { name: 'Violet', mine: 'linear-gradient(135deg, #a78bfa 0%, #6d28d9 100%)', accent: '#a78bfa' },
  { name: 'Ocean', mine: 'linear-gradient(135deg, #38bdf8 0%, #0369a1 100%)', accent: '#38bdf8' },
  { name: 'Forest', mine: 'linear-gradient(135deg, #4ade80 0%, #166534 100%)', accent: '#4ade80' },
  { name: 'Graphite', mine: 'linear-gradient(135deg, #94a3b8 0%, #334155 100%)', accent: '#94a3b8' },
];

const THEME_KEY = 'axon_chat_themes';

export const getChatTheme = (chatId: string): ChatTheme => {
  try {
    const map = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
    return CHAT_THEMES.find(t => t.name === map[chatId]) || CHAT_THEMES[0];
  } catch {
    return CHAT_THEMES[0];
  }
};

export const setChatTheme = (chatId: string, themeName: string) => {
  try {
    const map = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
    map[chatId] = themeName;
    localStorage.setItem(THEME_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
};

/* ------------------------- Nicknames ----------------------------- */

const NICKS_KEY = 'axon_chat_nicknames';

export const readNicknames = (chatId: string): Record<string, string> => {
  try {
    const all = JSON.parse(localStorage.getItem(NICKS_KEY) || '{}');
    return all[chatId] || {};
  } catch {
    return {};
  }
};

export const setNickname = (chatId: string, username: string, nick: string) => {
  try {
    const all = JSON.parse(localStorage.getItem(NICKS_KEY) || '{}');
    all[chatId] = all[chatId] || {};
    const clean = nick.trim().slice(0, 24);
    if (clean) all[chatId][username.toLowerCase()] = clean;
    else delete all[chatId][username.toLowerCase()];
    localStorage.setItem(NICKS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
};

export const getNickname = (chatId: string, username: string): string =>
  readNicknames(chatId)[username.toLowerCase()] || '';

/* --------------------------- Mute -------------------------------- */

const MUTE_KEY = 'axon_chat_muted';

export const isChatMuted = (chatId: string): boolean => {
  try {
    return !!JSON.parse(localStorage.getItem(MUTE_KEY) || '{}')[chatId];
  } catch {
    return false;
  }
};

export const setChatMuted = (chatId: string, muted: boolean) => {
  try {
    const map = JSON.parse(localStorage.getItem(MUTE_KEY) || '{}');
    if (muted) map[chatId] = true;
    else delete map[chatId];
    localStorage.setItem(MUTE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
};

/* --------------------- Message requests -------------------------- */

const ACCEPTED_REQUESTS_KEY = 'axon_accepted_requests';

/**
 * DM chats whose other party I don't follow land in Requests (Instagram
 * behavior). Once accepted, the chat id is remembered so it stays Primary.
 */
export const readAcceptedRequests = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(ACCEPTED_REQUESTS_KEY) || '[]');
  } catch {
    return [];
  }
};

export const markRequestAccepted = (chatId: string) => {
  try {
    const list = readAcceptedRequests();
    if (!list.includes(chatId)) {
      list.push(chatId);
      localStorage.setItem(ACCEPTED_REQUESTS_KEY, JSON.stringify(list));
    }
  } catch { /* ignore */ }
};

/* -------------------------- Groups ------------------------------- */

/** DM channels are `@a·@b`; everything else the user named is a group. */
export const isGroupChat = (chatName: string): boolean => !isDmName(chatName);

const isDmName = (name: string): boolean => /^@[\w.]+·@[\w.]+$/.test(name);

/** Other party's username in a 1:1 DM (null for groups). */
export const dmPeer = (chatName: string, myUsername: string): string | null => {
  const m = chatName.match(/^@([\w.]+)·@([\w.]+)$/);
  if (!m) return null;
  const me = myUsername.toLowerCase();
  if (m[1] === me) return m[2];
  if (m[2] === me) return m[1];
  return m[1];
};
