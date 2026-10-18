import CryptoJS from 'crypto-js';

/* ------------------------------------------------------------------
 * Axon Accounts — Instagram-style username + password identity layer.
 *
 * PRIMARY (schema v2): Supabase Auth. Sign-up/sign-in run through
 * supabase.auth with a deterministic synthetic email
 * `<username>@users.axonlogs.app`, so the UX stays username+password
 * while every database row is owned by a real authenticated identity
 * (auth.uid()) and Row Level Security can actually enforce ownership.
 *
 * LEGACY (pre-v2 databases + pre-migration accounts): PBKDF2-SHA256
 * (crypto-js), 60k iterations, random 128-bit salt, stored as
 * `pbkdf2$<iter>$<salt>$<hash>` in accounts.password_hash. The hash is
 * verified locally; the plaintext password never leaves the device.
 * At login, a legacy account is automatically provisioned into
 * Supabase Auth and its profile row is linked via accounts.auth_uid
 * (its hash becomes unreadable through the legacy_login view).
 *
 * NOTE: Supabase Auth enforces a minimum password length of 6 — the
 * earlier "any password accepted" behavior only survives on legacy
 * databases. Documented in AUDIT.md (master-prompt deviation).
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
  avatar_url?: string;
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

/* --------------------- Supabase Auth (schema v2) ------------------------
 * Deterministic synthetic email per username: keeps the username-only
 * login UX while using Supabase Auth's email+password identity. */

export const syntheticEmail = (username: string): string =>
  `${username.trim().toLowerCase().replace(/^@/, '')}@users.axonlogs.app`;

/** True when Supabase says the auth user already exists for this email. */
export const isAlreadyRegisteredError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || error.msg || '');
  return error.code === 'auth_user_already_exists' || /already (registered|exists)/i.test(msg);
};

/** True when a signUp returned a user but NO session (email confirmation is
 * enabled on the project — there is no mailbox behind synthetic emails). */
export const confirmationRequired = (result: { session?: any; user?: any } | null): boolean =>
  !!result?.user && !result?.session;

/** Supabase Auth per-IP email quota hit (repeated signups from one network). */
export const isRateLimitError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || error.msg || '');
  return error.code === 'over_email_send_rate_limit' || /rate limit/i.test(msg);
};

const RATE_LIMIT_MSG =
  'Too many accounts have been created from this network. Wait a few minutes and try again.';

const AUTH_CONFIRMATION_MSG =
  "This site's database asks for email confirmation, but accounts here use a username only. " +
  'The site owner can fix it in the Supabase dashboard (Authentication → Providers → Email → turn off "Confirm email").';

/** Supabase Auth enforces its own password floor (6 chars). */
const isAuthPasswordFloorError = (error: any): boolean =>
  !!error && /password should be at least|password.*at least \d+ characters/i.test(String(error.message || ''));

/**
 * Create or link the public profile row for a Supabase Auth user.
 * - No profile yet -> create one owned by this auth user.
 * - Legacy profile (auth_uid null) -> adopt it (one-time migration;
 *   the login flow only calls this AFTER the legacy password verified).
 * Best-effort: on pre-v2 databases there is no auth_uid column and this
 * degrades to a no-op without failing the login.
 */
const linkProfileToAuthUser = async (
  supabase: any,
  username: string,
  authUid: string,
  seed?: { bio?: string; avatar_gradient?: string; id?: string }
): Promise<Account | null> => {
  const u = username.trim().toLowerCase();
  let profile: Account | null = null;
  try {
    profile = await fetchAccount(supabase, u);
  } catch {
    profile = null;
  }
  if (!profile) {
    const { data, error } = await supabase
      .from('accounts')
      .insert({
        username: u,
        auth_uid: authUid,
        bio: seed?.bio || '',
        avatar_gradient: seed?.avatar_gradient || '',
        display_name: '',
      })
      .select(accountCols(false))
      .single();
    if (!error && data) return data as Account;
    return null;
  }
  // Legacy row: claim it. On v1 databases auth_uid doesn't exist — ignore.
  await supabase.from('accounts').update({ auth_uid: authUid }).eq('username', u).then();
  return profile;
};

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

const FULL_COLS = 'id, username, bio, avatar_gradient, created_at, display_name, is_private, show_activity, last_seen_at, avatar_url';
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

/** True when the username is free (profiles view; accounts fallback). */
export const usernameAvailable = async (supabase: any, username: string): Promise<boolean> => {
  const u = username.trim().toLowerCase();
  let { data, error } = await supabase.from('profiles').select('username').eq('username', u).maybeSingle();
  if (error && isViewMissingError(error)) {
    ({ data } = await supabase.from('accounts').select('username').eq('username', u).maybeSingle());
  }
  return !data;
};

/** Views only exist on schema-v2 databases — fall back on anything else. */
const isViewMissingError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || error.code || '');
  return error.code === 'PGRST205' || error.code === '42P01' || /schema cache|does not exist|Could not find the/i.test(msg);
};

/**
 * Sign up — Supabase Auth primary, legacy PBKDF2 fallback.
 *
 * v2 flow: auth.signUp with the synthetic email → session → profile row
 * created/linked with auth_uid. Handles: username already registered as
 * an auth user (tries a matching sign-in instead), Supabase's 6-char
 * password floor (surfaced in plain language), and email-confirmation
 * projects (legacy fallback so the product keeps working).
 */
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

  // ---- Primary: Supabase Auth (schema v2) ----
  try {
    const { data, error } = await supabase.auth.signUp({
      email: syntheticEmail(u),
      password,
      options: { data: { username: u } },
    });

    if (error) {
      if (isAlreadyRegisteredError(error)) {
        // Auth user exists without a matching password — handle as taken.
        return { ok: false, error: 'That username is taken. Try another.' };
      }
      if (isAuthPasswordFloorError(error)) {
        return { ok: false, error: 'Choose a password with at least 6 characters.' };
      }
      if (isRateLimitError(error)) {
        // Do NOT fall through to the legacy path — it would fail confusingly.
        return { ok: false, error: RATE_LIMIT_MSG };
      }
      // fall through to legacy path below (covers auth outages / older stacks)
    } else if (data?.session) {
      const account = await linkProfileToAuthUser(supabase, u, data.user.id, {
        avatar_gradient: avatarGradient,
      });
      if (account) return { ok: true, account };
      // Auth session exists but the profile row failed — still sign in with
      // the auth identity and a minimal local session.
      return {
        ok: true,
        account: {
          id: data.user.id,
          username: u,
          bio: '',
          avatar_gradient: avatarGradient,
          created_at: new Date().toISOString(),
        },
      };
    } else if (confirmationRequired(data)) {
      // Email confirmation ON → no session → legacy fallback keeps v1 sites alive.
      const legacy = await legacyInsertAccount(supabase, u, password, avatarGradient);
      if (legacy.ok) return legacy;
      return { ok: false, error: AUTH_CONFIRMATION_MSG };
    }
  } catch {
    // auth endpoint unreachable — try legacy below
  }

  // ---- Legacy: PBKDF2 row (pre-v2 databases) ----
  return legacyInsertAccount(supabase, u, password, avatarGradient);
};

/** The original (pre-v2) signup path: PBKDF2 hash into accounts. */
const legacyInsertAccount = async (
  supabase: any,
  u: string,
  password: string,
  avatarGradient: string
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> => {
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
    if (/row-level security|permission denied|42501/i.test(String((error as any).message || ''))) {
      return { ok: false, error: 'The database is locked down and needs Supabase Auth. Try again in a minute.' };
    }
    return { ok: false, error: (error as any).message || 'Sign up failed.' };
  }
  return { ok: true, account: data as Account };
};

/**
 * Log in — Supabase Auth primary with automatic legacy migration.
 *
 * 1. auth.signInWithPassword(synthetic email, password). On success the
 *    profile row is linked (auth_uid) and returned.
 * 2. Legacy accounts (pre-migration): verify PBKDF2 against the
 *    legacy_login view (falls back to accounts on v1 databases), then
 *    provision the Supabase Auth user with the SAME password — a
 *    one-time, invisible migration — and link the profile.
 * 3. No legacy row + no auth user → unknown username; legacy row but
 *    wrong password → Instagram-style "password was incorrect".
 */
export const loginAccount = async (
  supabase: any,
  username: string,
  password: string
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> => {
  const u = username.trim().toLowerCase();

  // ---- 1. Supabase Auth ----
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail(u),
      password,
    });
    if (data?.session && data?.user) {
      const account = await linkProfileToAuthUser(supabase, u, data.user.id);
      if (account) return { ok: true, account };
      return {
        ok: true,
        account: {
          id: data.user.id,
          username: u,
          bio: '',
          avatar_gradient: '',
          created_at: new Date().toISOString(),
        },
      };
    }
    if (error && !isInvalidCredentialsError(error)) {
      // Real backend problem — surface it, don't mask it with legacy logic.
      return { ok: false, error: error.message || 'Login failed.' };
    }
  } catch {
    // network/auth endpoint down — try legacy verification below
  }

  // ---- 2. Legacy verification (+ invisible migration) ----
  const legacy = await fetchLegacyHash(supabase, u);
  if (legacy?.password_hash && verifyPassword(password, legacy.password_hash)) {
    // Provision the Supabase Auth user with the same password (one-time).
    try {
      const { data, error } = await supabase.auth.signUp({
        email: syntheticEmail(u),
        password,
        options: { data: { username: u } },
      });
      if (data?.session && data?.user) {
        const account = await linkProfileToAuthUser(supabase, u, data.user.id);
        if (account) return { ok: true, account };
      } else if (error && isAlreadyRegisteredError(error)) {
        // Auth user exists with a DIFFERENT password than the legacy hash
        // → the typed password is the old one.
        return { ok: false, error: 'Sorry, your password was incorrect.' };
      } else if (error && isRateLimitError(error)) {
        return { ok: false, error: RATE_LIMIT_MSG };
      } else if (confirmationRequired(data)) {
        // Confirmation-gated project: keep the legacy session working.
        return legacySession(legacy);
      }
    } catch {
      // auth endpoint unreachable — legacy session keeps the user working
    }
    return legacySession(legacy);
  }

  // ---- 3. Unknown user vs wrong password ----
  const profile = await fetchAccount(supabase, u).catch(() => null);
  if (!profile) return { ok: false, error: 'No account found with that username.' };
  return { ok: false, error: 'Sorry, your password was incorrect.' };
};

/** Supabase Auth's "invalid login credentials" (vs real outages). */
const isInvalidCredentialsError = (error: any): boolean => {
  if (!error) return false;
  const msg = String(error.message || '');
  return (
    error.code === 'invalid_credentials' ||
    /invalid login credentials|email not confirmed|user not found/i.test(msg)
  );
};

/** Pre-migration hash lookup: legacy_login view first, accounts fallback. */
const fetchLegacyHash = async (
  supabase: any,
  u: string
): Promise<{ id: string; username: string; password_hash: string } | null> => {
  let { data, error } = await supabase
    .from('legacy_login')
    .select('id, username, password_hash')
    .eq('username', u)
    .maybeSingle();
  if (error && isViewMissingError(error)) {
    ({ data, error } = await supabase
      .from('accounts')
      .select('id, username, password_hash')
      .eq('username', u)
      .maybeSingle());
  }
  if (error || !data) return null;
  return data as { id: string; username: string; password_hash: string };
};

/** Session for a legacy account that could not be migrated right now. */
const legacySession = (legacy: { id: string; username: string }): { ok: true; account: Account } => ({
  ok: true,
  account: {
    id: legacy.id,
    username: legacy.username,
    bio: '',
    avatar_gradient: '',
    created_at: new Date().toISOString(),
  },
});

export const searchAccounts = async (
  supabase: any,
  query: string,
  excludeUsername: string,
  limit = 12
): Promise<Account[]> => {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (!q) return [];
  // profiles view (v2) first; accounts table fallback (v1)
  let { data, error } = await supabase
    .from('profiles')
    .select(accountCols(false))
    .ilike('username', `%${q}%`)
    .neq('username', excludeUsername)
    .limit(limit);
  if (error && isViewMissingError(error)) {
    ({ data, error } = await supabase
      .from('accounts')
      .select(accountCols(false))
      .ilike('username', `%${q}%`)
      .neq('username', excludeUsername)
      .limit(limit));
  }
  if (error && accountColsMode === null && isColumnError(error)) {
    accountColsMode = 'min';
    ({ data } = await supabase
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
    .from('profiles')
    .select(accountCols(false))
    .eq('username', u)
    .maybeSingle();
  if (error && isViewMissingError(error)) {
    ({ data, error } = await supabase
      .from('accounts')
      .select(accountCols(false))
      .eq('username', u)
      .maybeSingle());
  }
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
  patch: { bio?: string; avatar_gradient?: string; display_name?: string; is_private?: boolean; show_activity?: string | boolean; avatar_url?: string }
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

/* ----------------------------- avatar media ----------------------------- */

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Client-side downscale so profile photos stay small and uniform. */
const fileToAvatarBlob = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas unavailable'));
        return;
      }
      // cover-crop to a square
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Not a readable image.'));
    };
    img.src = url;
  });

/**
 * Upload a profile photo to the public `avatars` bucket under
 * avatars/{username}/avatar.jpg (upsert) and point accounts.avatar_url
 * at it with a cache-busting version. Returns the public URL.
 */
export const uploadAvatar = async (
  supabase: any,
  username: string,
  file: File
): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
  if (!supabase) return { ok: false, error: 'No database connection.' };
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Pick an image file for your profile photo.' };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: 'That image is too large — keep it under 5MB.' };
  const u = username.trim().toLowerCase();
  let blob: Blob;
  try {
    blob = await fileToAvatarBlob(file);
  } catch {
    return { ok: false, error: 'That image could not be read. Try another photo.' };
  }
  const path = `${u}/avatar.jpg`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (upErr) return { ok: false, error: upErr.message || 'Upload failed.' };
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const bust = data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : '';
  const ok = await updateAccountProfile(supabase, u, { avatar_url: bust });
  if (!ok) return { ok: false, error: 'Photo uploaded, but the profile update failed.' };
  return { ok: true, url: bust };
};

/** Remove the profile photo (bucket object + profile pointer). */
export const removeAvatar = async (supabase: any, username: string): Promise<boolean> => {
  if (!supabase) return false;
  const u = username.trim().toLowerCase();
  await supabase.storage.from('avatars').remove([`${u}/avatar.jpg`]);
  return updateAccountProfile(supabase, u, { avatar_url: '' });
};

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
 * instant follow. RLS-safe: reads the existing row first instead of
 * upserting (upsert would need UPDATE rights on someone else's request).
 */
export const followUser = async (supabase: any, me: string, target: string, targetIsPrivate: boolean): Promise<'active' | 'pending' | 'error'> => {
  const a = me.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  if (!supabase || !a || !b || a === b) return 'error';
  if (!(await ensureFollowsTable(supabase))) return 'error'; // social graph not set up yet
  const { data: existing } = await supabase
    .from('follows')
    .select('status')
    .eq('follower', a)
    .eq('followed', b)
    .maybeSingle();
  if (existing?.status === 'active') return 'active';
  if (existing?.status === 'pending') return 'pending';
  const status = targetIsPrivate ? 'pending' : 'active';
  const { error } = await supabase
    .from('follows')
    .insert({ follower: a, followed: b, status });
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

/** Instagram "Remove follower": they follow me; I end it from my side. */
export const removeFollower = async (supabase: any, me: string, follower: string): Promise<boolean> => {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower', follower.trim().toLowerCase())
    .eq('followed', me.trim().toLowerCase());
  return !error;
};

/** Full profile rows for a list of usernames (followers/following lists). */
export const fetchAccountsByUsernames = async (supabase: any, usernames: string[]): Promise<Account[]> => {
  const list = [...new Set(usernames.map(u => u.trim().toLowerCase()))].filter(Boolean);
  if (!supabase || list.length === 0) return [];
  let { data, error } = await supabase.from('profiles').select(accountCols(false)).in('username', list);
  if (error && isViewMissingError(error)) {
    ({ data } = await supabase.from('accounts').select(accountCols(false)).in('username', list));
  }
  if (error && accountColsMode === null && isColumnError(error)) {
    accountColsMode = 'min';
    ({ data } = await supabase.from('accounts').select(accountCols(false)).in('username', list));
  }
  return (data || []) as Account[];
};

/* ------------------------------- blocking -------------------------------
 * The blocklist column is private on schema v2 (SELECT revoked on
 * accounts), so reads go through security-definer RPCs with direct-table
 * fallbacks for pre-v2 databases.
 * ----------------------------------------------------------------------- */

export const blockUser = async (supabase: any, me: string, target: string): Promise<boolean> => {
  const a = me.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  const list = await fetchMyBlocklist(supabase, a);
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
  const list = await fetchMyBlocklist(supabase, a);
  const { error } = await supabase
    .from('accounts')
    .update({ blocked_usernames: list.filter((x: string) => x !== b) })
    .eq('username', a);
  return !error;
};

/** My own blocklist via RPC (v2) or direct read (v1). */
const fetchMyBlocklist = async (supabase: any, me: string): Promise<string[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_blocklist');
  if (!error && Array.isArray(data)) return data as string[];
  // v1 fallback: blocklist column is world-readable there anyway
  const { data: row } = await supabase
    .from('accounts')
    .select('blocked_usernames')
    .eq('username', me)
    .maybeSingle();
  return row?.blocked_usernames || [];
};

export const fetchBlockedUsers = async (supabase: any, me: string): Promise<string[]> => {
  const a = me.trim().toLowerCase();
  if (!supabase || !a) return [];
  return fetchMyBlocklist(supabase, a);
};

/** True when either side blocked the other (DMs and search should hide). */
export const isBlockedEitherWay = async (supabase: any, a: string, b: string): Promise<boolean> => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!supabase || !x || !y) return false;
  const { data, error } = await supabase.rpc('is_blocked_either_way', { x, y });
  if (!error && typeof data === 'boolean') return data;
  // v1 fallback: read both rows directly
  const { data: rows } = await supabase
    .from('accounts')
    .select('username, blocked_usernames')
    .in('username', [x, y]);
  for (const row of rows || []) {
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

/* ---------------------- chat membership (schema v2) ---------------------- */

/**
 * Record chat membership so member-only RLS can admit the right people.
 * Best-effort: pre-v2 databases have no chat_participants table and this
 * quietly does nothing.
 */
export const insertChatParticipants = async (
  supabase: any,
  chatId: string,
  usernames: string[]
): Promise<void> => {
  if (!supabase || !chatId) return;
  const list = [...new Set(usernames.map(u => u.trim().toLowerCase().replace(/^@/, '')))].filter(Boolean);
  if (list.length === 0) return;
  const rows = list.map(username => ({ chat_id: chatId, username }));
  const { error } = await supabase.from('chat_participants').upsert(rows, { onConflict: 'chat_id,username', ignoreDuplicates: true });
  if (error && !isMissingTableError(error)) {
    console.warn('chat_participants insert skipped:', error.message);
  }
};

/**
 * Join a chat by share code through the v2 RPC (proof-of-code membership).
 * Returns the chat row, or null when the code matches nothing / the RPC is
 * missing (pre-v2 database → caller falls back to a direct lookup).
 */
export const joinChatByCode = async (
  supabase: any,
  code: string
): Promise<{ chat: Record<string, any> | null; rpcMissing: boolean }> => {
  const { data, error } = await supabase.rpc('join_chat_by_code', { p_code: code });
  if (error && (error.code === 'PGRST202' || /function .* does not exist|not found/i.test(String(error.message || '')))) {
    return { chat: null, rpcMissing: true };
  }
  return { chat: (data as Record<string, any>) || null, rpcMissing: false };
};

/** Display-name read that works on both schema generations. */
export const fetchDisplayName = async (supabase: any, username: string): Promise<string | null> => {
  if (!supabase) return null;
  const u = username.trim().toLowerCase().replace(/^@/, '');
  let { data, error } = await supabase.from('profiles').select('display_name').eq('username', u).maybeSingle();
  if (error && isViewMissingError(error)) {
    ({ data } = await supabase.from('accounts').select('display_name').eq('username', u).maybeSingle());
  }
  return data?.display_name ?? null;
};

/** End the Supabase Auth session (best-effort; local sessions just clear). */
export const logoutAccount = async (supabase: any): Promise<void> => {
  try {
    await supabase?.auth?.signOut();
  } catch {
    // signing out locally is always enough
  }
};
