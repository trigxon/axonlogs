/* ------------------------------------------------------------------
 * Chat Lock — PURE core (no Supabase, no React): safe to import from
 * Node tests and from both the server-sync wrapper and the contexts.
 *
 * State model:
 *   - protectedChatIds: conversations the user chose to protect (synced
 *     from the `conversation_locks` table — server-persisted).
 *   - unlockedChatIds: THIS TAB SESSION's unlocked set. Module-level
 *     memory ONLY — never localStorage/sessionStorage — so refresh,
 *     tab hide, route change and deep links all return to locked.
 * ------------------------------------------------------------------ */

export const CHAT_LOCK_ITERATIONS = 310_000;
export const CHAT_LOCK_MIN_LENGTH = 4;
/** Server-side hard-lock threshold (verify_chat_lock RPC). */
export const CHAT_LOCK_MAX_ATTEMPTS = 5;

export const validateChatLockPassword = (password: string): string | null => {
  if (!password.length) return 'Choose a passcode for your chat lock.';
  if (password.length < CHAT_LOCK_MIN_LENGTH) {
    return `Use at least ${CHAT_LOCK_MIN_LENGTH} characters so the lock isn't trivial to guess.`;
  }
  return null;
};

const toHex = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

/** Cryptographically random 16-byte hex salt. */
export const generateChatLockSalt = (): string => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
};

/** PBKDF2-SHA256 verifier (hex). Deterministic for (password, salt). */
export const deriveChatLockVerifier = async (
  password: string,
  salt: string
): Promise<string> => {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: CHAT_LOCK_ITERATIONS },
    key,
    256
  );
  return toHex(bits);
};

/* ---------------- in-memory tab-session unlock state -------------- */

let masterEnabled = false;
let autoLockOnHide = true;
const protectedChatIds = new Set<string>();
const unlockedChatIds = new Set<string>();

/** Hydrate the module state from the server (called after fetches). */
export const setChatLockRuntimeState = (state: {
  enabled: boolean;
  autoLockOnHide: boolean;
  protectedChatIds: string[];
}) => {
  masterEnabled = state.enabled;
  autoLockOnHide = state.autoLockOnHide;
  protectedChatIds.clear();
  state.protectedChatIds.forEach(id => protectedChatIds.add(id));
  // A conversation that is no longer protected cannot stay unlocked.
  [...unlockedChatIds].forEach(id => { if (!protectedChatIds.has(id)) unlockedChatIds.delete(id); });
};

/** TRUE when a conversation currently sits behind the lock screen. */
export const isPrivacyLocked = (chatId: string): boolean =>
  masterEnabled && protectedChatIds.has(chatId) && !unlockedChatIds.has(chatId);

export const isChatProtected = (chatId: string): boolean => protectedChatIds.has(chatId);

export const markChatUnlocked = (chatId: string): void => {
  if (protectedChatIds.has(chatId)) unlockedChatIds.add(chatId);
};

/** Lock one conversation now (returns true when it was unlocked). */
export const lockConversation = (chatId: string): boolean => unlockedChatIds.delete(chatId);

/** Lock every unlocked conversation (tab hidden / route change). Returns ids locked. */
export const lockAllConversations = (): string[] => {
  const ids = [...unlockedChatIds];
  unlockedChatIds.clear();
  return ids;
};

export const getAutoLockOnHide = (): boolean => autoLockOnHide;

/** Master switch as seen by the runtime module (after a sync). */
export const getChatLockEnabledState = (): boolean => masterEnabled;

/** Snapshot of the protected conversation ids (after a sync). */
export const chatLockProtectedIds = (): string[] => [...protectedChatIds];

/** Test/runtime helper: reset the in-memory state completely. */
export const resetChatLockRuntime = (): void => {
  masterEnabled = false;
  autoLockOnHide = true;
  protectedChatIds.clear();
  unlockedChatIds.clear();
};
