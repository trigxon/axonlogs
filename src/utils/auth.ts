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

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      username: u,
      password_hash: hashPassword(password),
      bio: '',
      avatar_gradient: avatarGradient,
    })
    .select('id, username, bio, avatar_gradient, created_at')
    .single();

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
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, password_hash, bio, avatar_gradient, created_at')
    .eq('username', u)
    .maybeSingle();

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
    .select('id, username, bio, avatar_gradient, created_at')
    .ilike('username', `%${q}%`)
    .limit(limit);
  if (excludeUsername) req = req.neq('username', excludeUsername);
  const { data } = await req;
  return (data || []) as Account[];
};

export const fetchAccount = async (supabase: any, username: string): Promise<Account | null> => {
  const u = username.trim().toLowerCase();
  const { data } = await supabase
    .from('accounts')
    .select('id, username, bio, avatar_gradient, created_at')
    .eq('username', u)
    .maybeSingle();
  return (data as Account) || null;
};

export const updateAccountProfile = async (
  supabase: any,
  username: string,
  patch: { bio?: string; avatar_gradient?: string }
): Promise<boolean> => {
  const u = username.trim().toLowerCase();
  const { error } = await supabase.from('accounts').update(patch).eq('username', u);
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
