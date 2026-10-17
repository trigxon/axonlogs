import CryptoJS from 'crypto-js';

/* ------------------------------------------------------------------
 * Axon Accounts — Instagram-style username + password identity layer.
 *
 * Stored in the Supabase `accounts` table (see supabase/schema.sql):
 *   id uuid pk, username text unique, password_hash text,
 *   bio text, avatar_gradient text, created_at, last_seen_at
 *
 * Password hashing: PBKDF2-SHA256 (crypto-js), 60k iterations, random
 * 128-bit salt, stored as `pbkdf2$<iter>$<salt>$<hash>`. The hash is
 * verified locally — the plaintext password never leaves the device.
 *
 * DM delivery: `dm_invites` rows carry { chat_id, share_code,
 * from_username, to_username } so the recipient's client can auto-join
 * the encrypted channel — the Instagram "Message @user" flow, built on
 * the existing per-chat AES (share_code) key model.
 * ------------------------------------------------------------------ */

export interface Account {
  id: string;
  username: string;
  bio: string;
  avatar_gradient: string;
  created_at: string;
  display_name?: string;
  is_private?: boolean;
  show_activity?: boolean;
  last_seen_at?: string;
}

export interface DmInvite {
  id: string;
  chat_id: string;
  share_code: string;
  from_username: string;
  to_username: string;
  created_at: string;
}

const SESSION_KEY = 'axon_session';
const PBKDF2_ITERATIONS = 60000;

/* --------------------------- password hashing --------------------------- */

export const hashPassword = (password: string): string => {
  const salt = CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
  const hash = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Hex);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  try {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const expected = parts[3];
    const hash = CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations,
      hasher: CryptoJS.algo.SHA256,
    }).toString(CryptoJS.enc.Hex);
    // constant-time-ish compare
    if (hash.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
};

/* ----------------------------- validation ------------------------------ */

/**
 * Username rules — exactly like Instagram:
 *   • 1–30 characters
 *   • letters (a–z), numbers (0–9), periods (.) and underscores (_) only
 *   • can't start or end with a period
 *   • must be unique (checked against the accounts table, live while typing)
 * Usernames are stored lowercased and matched case-insensitively.
 */
export const USERNAME_MAX = 30;
export const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

export const validateUsername = (username: string): string | null => {
  const u = username.trim().toLowerCase();
  if (!u) return 'Choose a username.';
  if (u.length > USERNAME_MAX) return `Username must be ${USERNAME_MAX} characters or less.`;
  if (!USERNAME_RE.test(u)) return 'Only letters, numbers, periods and underscores are allowed.';
  if (u.startsWith('.') || u.endsWith('.')) return "A username can't start or end with a period.";
  return null;
};

/**
 * Password policy: intentionally NONE.
 * Any password is accepted — no minimum length, no maximum, no character
 * requirements, spaces and unicode included. (Instagram-style restrictions
 * apply to usernames only, by design.) The password is PBKDF2-SHA256
 * hashed on-device before it ever leaves the browser.
 */
export const validatePassword = (_password: string): string | null => null;

/* ------------------------------ session -------------------------------- */

export interface AxonSession {
  username: string;
  accountId: string;
  local?: boolean; // true when continuing without the cloud backend
}

export const getStoredSession = (): AxonSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AxonSession;
    return s && s.username ? s : null;
  } catch {
    return null;
  }
};

export const setStoredSession = (session: AxonSession) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearStoredSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

/* --------------------------- Supabase CRUD ----------------------------- */

export const isMissingTableError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || error.code || '');
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /schema cache|does not exist|Could not find the table/i.test(msg)
  );
};

/* ---------------- schema negotiation (graceful degradation) ----------------
 * The cloud schema is one file: supabase/schema.sql. Until the site owner
 * re-runs it after an update, the live database can lag behind the client
 * (older accounts columns, no follows table yet). Instead of breaking the
 * whole app, we probe once and negotiate down to what the DB supports.
 * A page reload after the schema update picks everything back up. */

type AccountColsMode = 'full' | 'min';
let accountColsMode: AccountColsMode | null = null; // null = probe on first use
let followsTableReady: boolean | null = null;       // null = probe on first use

const isColumnError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || '');
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    /Could not find the|schema cache|column .* does not exist/i.test(msg)
  );
};

const FULL_COLS = 'id, username, bio, avatar_gradient, created_at, display_name, is_private, show_activity, last_seen_at';
const MIN_COLS = 'id, username, bio, avatar_gradient, created_at, last_seen_at';

const accountCols = (withHash: boolean): string => {
  const base = accountColsMode === 'min' ? MIN_COLS : FULL_COLS;
  return withHash ? `password_hash, ${base}` : base;
};

/** One cheap probe so we never hammer a missing table. */
const ensureFollowsTable = async (supabase: any): Promise<boolean> => {
  if (followsTableReady !== null) return followsTableReady;
  try {
    const { error } = await supabase.from('follows').select('follower').limit(1);
    followsTableReady = !error;
  } catch {
    followsTableReady = false;
  }
  return followsTableReady;
};

/** True when the username is free. */
export const usernameAvailable = async (supabase: any, username: string): Promise<boolean> => {
  const u = username.trim().toLowerCase();
  const { data } = await supabase
    .from('accounts')
    .select('username')
    .eq('username', u)
    .maybeSingle();
  return !data;
};

export const signupAccount = async (
  supabase: any,
  username: string,
  password: string,
  avatarGradient: string
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> => {
  const u = username.trim().toLowerCase();

  const vUser = validateUsername(u);
  if (vUser) return { ok: false, error: vUser };
  const vPass = validatePassword(password);
  if (vPass) return { ok: false, error: vPass };

  const free = await usernameAvailable(supabase, u).catch(() => true);
  if (!free) return { ok: false, error: 'That username is taken. Try another.' };

  const fullPayload = { username: u, password_hash: hashPassword(password), bio: '', avatar_gradient: avatarGradient, display_name: '' };
  const minPayload = { username: u, password_hash: hashPassword(password), bio: '', avatar_gradient: avatarGradient };

  let { data, error } = await supabase
    .from('accounts')
    .insert(fullPayload)
    .select(accountCols(false))
    .single();
  if (error && accountColsMode === null && isColumnError(error)) {
    // Older live schema — retry without the newer columns
    accountColsMode = 'min';
    ({ data, error } = await supabase
      .from('accounts')
      .insert(minPayload)
      .select(accountCols(false))
      .single());
  }

  if (error) {
    if ((error as any).code === '23505') return { ok: false, error: 'That username is taken. Try another.' };
    return { ok: false, error: error.message || 'Sign up failed.' };
  }
  return { ok: true, account: data as Account };
};

export const loginAccount = async (
  supabase: any,
  username: string,
  password: string
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> => {
  const u = username.trim().toLowerCase();
  let { data, error } = await supabase
    .from('accounts')
    .select(accountCols(true))
    .eq('username', u)
    .maybeSingle();
  if (error && accountColsMode === null && isColumnError(error)) {
    accountColsMode = 'min';
    ({ data, error } = await supabase
      .from('accounts')
      .select(accountCols(true))
      .eq('username', u)
      .maybeSingle());
  }

  if (error) return { ok: false, error: error.message || 'Login failed.' };
  if (!data) return { ok: false, error: 'No account found with that username.' };
  if (!verifyPassword(password, data.password_hash)) {
    return { ok: false, error: 'Sorry, your password was incorrect.' };
  }

  // touch last_seen_at (best-effort)
  supabase.from('accounts').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id).then();

  const { password_hash: _ph, ...account } = data;
  return { ok: true, account: account as Account };
};

export const searchAccounts = async (
  supabase: any,
  query: string,
  excludeUsername: string,
  limit = 12
): Promise<Account[]> => {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (!q) return [];
  let req = supabase
    .from('accounts')
    .select(accountCols(false))
    .ilike('username', `%${q}%`)
    .limit(limit);
  if (excludeUsername) req = req.neq('username', excludeUsername);
  let { data, error } = await req;
  if (error && accountColsMode === null && isColumnError(error)) {
    accountColsMode = 'min';
    ({ data, error } = await supabase
      .from('accounts')
      .select(accountCols(false))
      .ilike('username', `%${q}%`)
      .neq('username', excludeUsername)
      .limit(limit));
  }
  return (data || []) as Account[];
};

export const fetchAccount = async (supabase: any, username: string): Promise<Account | null> => {
  const u = username.trim().toLowerCase();
  let { data, error } = await supabase
    .from('accounts')
    .select(accountCols(false))
    .eq('username', u)
    .maybeSingle();
  if (error && accountColsMode === null && isColumnError(error)) {
    accountColsMode = 'min';
    ({ data } = await supabase
      .from('accounts')
      .select(accountCols(false))
      .eq('username', u)
      .maybeSingle());
  }
  return (data as Account) || null;
};

export const updateAccountProfile = async (
  supabase: any,
  username: string,
  patch: { bio?: string; avatar_gradient?: string; display_name?: string; is_private?: boolean; show_activity?: string | boolean }
): Promise<boolean> => {
  const u = username.trim().toLowerCase();
  const applyPatch = (p: typeof patch) => supabase.from('accounts').update(p).eq('username', u);
  let { error } = await applyPatch(patch);
  if (error && accountColsMode === null && isColumnError(error)) {
    // Older schema — drop the newer fields and retry with the basics
    accountColsMode = 'min';
    const minPatch: typeof patch = {};
    if (patch.bio !== undefined) minPatch.bio = patch.bio;
    if (patch.avatar_gradient !== undefined) minPatch.avatar_gradient = patch.avatar_gradient;
    ({ error } = await applyPatch(minPatch));
  }
  return !error;
};

/* ----------------------------- DM invites ------------------------------ */

/** Deterministic DM channel name: `@a·@b` with both handles sorted. */
export const dmChatName = (a: string, b: string): string => {
  const [x, y] = [a.trim().toLowerCase(), b.trim().toLowerCase()].sort();
  return `@${x}·@${y}`;
};

/** The display name of a DM from MY perspective: the other person's handle. */
export const dmDisplayName = (chatName: string, myUsername: string): string => {
  if (!myUsername) return chatName;
  const m = chatName.match(/^@([\w.]+)·@([\w.]+)$/);
  if (!m) return chatName;
  const me = myUsername.trim().toLowerCase();
  if (m[1] === me) return `@${m[2]}`;
  if (m[2] === me) return `@${m[1]}`;
  return chatName;
};

export const isDmChatName = (chatName: string): boolean =>
  /^@[\w.]+·@[\w.]+$/.test(chatName);

/** Stronger passphrase for DM channels (delivered via invite, not typed). */
export const generateDmPasscode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) tail += alphabet[bytes[i] % alphabet.length];
  return `DM-${tail}`;
};

export const sendDmInvite = async (
  supabase: any,
  toUsername: string,
  chatId: string,
  shareCode: string,
  fromUsername: string
): Promise<boolean> => {
  const { error } = await supabase.from('dm_invites').insert({
    chat_id: chatId,
    share_code: shareCode,
    from_username: fromUsername.trim().toLowerCase(),
    to_username: toUsername.trim().toLowerCase(),
  });
  return !error;
};

export const fetchMyDmInvites = async (supabase: any, username: string): Promise<DmInvite[]> => {
  const u = username.trim().toLowerCase();
  const { data } = await supabase
    .from('dm_invites')
    .select('id, chat_id, share_code, from_username, to_username, created_at')
    .eq('to_username', u)
    .order('created_at', { ascending: true })
    .limit(50);
  return (data || []) as DmInvite[];
};

/* ----------------------------- social graph -----------------------------
 * Instagram follow model: follows rows (follower → followed) with status
 * 'active' or 'pending' (follow request to a private account). Blocks live
 * on accounts.blocked_usernames (per-account blocklist).
 * ----------------------------------------------------------------------- */

export type FollowState = {
  following: boolean;   // I follow them (active)
  requested: boolean;   // I sent a follow request (pending, private account)
  followsMe: boolean;   // they follow me (active)
};

/** Relationship between `me` and `them` in one round-trip. */
export const fetchFollowState = async (supabase: any, me: string, them: string): Promise<FollowState> => {
  const a = me.trim().toLowerCase();
  const b = them.trim().toLowerCase();
  const state: FollowState = { following: false, requested: false, followsMe: false };
  if (!supabase || !a || !b || a === b) return state;
  if (!(await ensureFollowsTable(supabase))) return state; // social graph not set up yet
  const { data } = await supabase
    .from('follows')
    .select('follower, followed, status')
    .or(`and(follower.eq.${a},followed.eq.${b}),and(follower.eq.${b},followed.eq.${a})`);
  for (const row of data || []) {
    if (row.follower === a && row.followed === b) {
      if (row.status === 'active') state.following = true;
      else state.requested = true;
    }
    if (row.follower === b && row.followed === a && row.status === 'active') state.followsMe = true;
  }
  return state;
};

/**
 * Follow a user. Private accounts get a 'pending' request instead of an
 * instant follow. Re-following a pending request is a no-op. Returns the
 * resulting status ('active' | 'pending').
 */
export const followUser = async (supabase: any, me: string, target: string, targetIsPrivate: boolean): Promise<'active' | 'pending' | 'error'> => {
  const a = me.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  if (!supabase || !a || !b || a === b) return 'error';
  if (!(await ensureFollowsTable(supabase))) return 'error'; // social graph not set up yet
  const status = targetIsPrivate ? 'pending' : 'active';
  const { error } = await supabase
    .from('follows')
    .upsert({ follower: a, followed: b, status }, { onConflict: 'follower,followed' });
  return error ? 'error' : status;
};

export const unfollowUser = async (supabase: any, me: string, target: string): Promise<boolean> => {
  const a = me.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  if (!(await ensureFollowsTable(supabase))) return false;
  const { error } = await supabase.from('follows').delete().eq('follower', a).eq('followed', b);
  return !error;
};

/** Usernames that actively follow `username` (their followers). */
export const fetchFollowers = async (supabase: any, username: string, limit = 200): Promise<string[]> => {
  const u = username.trim().toLowerCase();
  if (!supabase || !(await ensureFollowsTable(supabase))) return [];
  const { data } = await supabase
    .from('follows')
    .select('follower')
    .eq('followed', u)
    .eq('status', 'active')
    .limit(limit);
  return (data || []).map((r: any) => r.follower as string);
};

/** Usernames that `username` actively follows. */
export const fetchFollowing = async (supabase: any, username: string, limit = 200): Promise<string[]> => {
  const u = username.trim().toLowerCase();
  if (!supabase || !(await ensureFollowsTable(supabase))) return [];
  const { data } = await supabase
    .from('follows')
    .select('followed')
    .eq('follower', u)
    .eq('status', 'active')
    .limit(limit);
  return (data || []).map((r: any) => r.followed as string);
};

/** Pending follow requests addressed to me (private accounts). */
export const fetchFollowRequests = async (supabase: any, username: string, limit = 100): Promise<string[]> => {
  const u = username.trim().toLowerCase();
  if (!supabase || !(await ensureFollowsTable(supabase))) return [];
  const { data } = await supabase
    .from('follows')
    .select('follower')
    .eq('followed', u)
    .eq('status', 'pending')
    .limit(limit);
  return (data || []).map((r: any) => r.follower as string);
};

export const acceptFollowRequest = async (supabase: any, me: string, requester: string): Promise<boolean> => {
  const { error } = await supabase
    .from('follows')
    .update({ status: 'active' })
    .eq('follower', requester.trim().toLowerCase())
    .eq('followed', me.trim().toLowerCase());
  return !error;
};

export const declineFollowRequest = async (supabase: any, me: string, requester: string): Promise<boolean> => {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower', requester.trim().toLowerCase())
    .eq('followed', me.trim().toLowerCase());
  return !error;
};

/** Full profile rows for a list of usernames (followers/following lists). */
export const fetchAccountsByUsernames = async (supabase: any, usernames: string[]): Promise<Account[]> => {
  const list = [...new Set(usernames.map(u => u.trim().toLowerCase()))].filter(Boolean);
  if (!supabase || list.length === 0) return [];
  let { data, error } = await supabase.from('accounts').select(accountCols(false)).in('username', list);
  if (error && accountColsMode === null && isColumnError(error)) {
    accountColsMode = 'min';
    ({ data } = await supabase.from('accounts').select(accountCols(false)).in('username', list));
  }
  return (data || []) as Account[];
};

/* ------------------------------- blocking ------------------------------- */

export const blockUser = async (supabase: any, me: string, target: string): Promise<boolean> => {
  const a = me.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  const { data } = await supabase
    .from('accounts')
    .select('blocked_usernames')
    .eq('username', a)
    .maybeSingle();
  const list: string[] = data?.blocked_usernames || [];
  if (list.includes(b)) return true;
  const { error } = await supabase
    .from('accounts')
    .update({ blocked_usernames: [...list, b] })
    .eq('username', a);
  return !error;
};

export const unblockUser = async (supabase: any, me: string, target: string): Promise<boolean> => {
  const a = me.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  const { data } = await supabase
    .from('accounts')
    .select('blocked_usernames')
    .eq('username', a)
    .maybeSingle();
  const list: string[] = (data?.blocked_usernames || []).filter((x: string) => x !== b);
  const { error } = await supabase
    .from('accounts')
    .update({ blocked_usernames: list })
    .eq('username', a);
  return !error;
};

export const fetchBlockedUsers = async (supabase: any, me: string): Promise<string[]> => {
  const a = me.trim().toLowerCase();
  if (!supabase || !a) return [];
  const { data, error } = await supabase
    .from('accounts')
    .select('blocked_usernames')
    .eq('username', a)
    .maybeSingle();
  if (error) return []; // column/table not migrated yet — blocklist is optional
  return data?.blocked_usernames || [];
};

/** True when either side blocked the other (DMs and search should hide). */
export const isBlockedEitherWay = async (supabase: any, a: string, b: string): Promise<boolean> => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!supabase || !x || !y) return false;
  const { data, error } = await supabase
    .from('accounts')
    .select('username, blocked_usernames')
    .in('username', [x, y]);
  if (error) return false; // column/table not migrated yet
  for (const row of data || []) {
    const list: string[] = row.blocked_usernames || [];
    if (row.username === x && list.includes(y)) return true;
    if (row.username === y && list.includes(x)) return true;
  }
  return false;
};

/* ---------------------------- activity status ---------------------------- */

/** Touch my last_seen_at so "Active now" stays truthful (best-effort). */
export const touchLastSeen = (supabase: any, username: string) => {
  if (!supabase) return;
  supabase
    .from('accounts')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('username', username.trim().toLowerCase())
    .then();
};

/** Instagram-style presence label from a peer's last_seen_at. */
export const activityLabel = (account: Pick<Account, 'last_seen_at' | 'show_activity'> | null): string | null => {
  if (!account || account.show_activity === false || !account.last_seen_at) return null;
  const mins = Math.floor((Date.now() - new Date(account.last_seen_at).getTime()) / 60000);
  if (mins < 1) return 'Active now';
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return null;
};
