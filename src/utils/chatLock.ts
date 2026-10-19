import { supabase as supabaseClient } from '../contexts/CryptoContext';
import {
  deriveChatLockVerifier, generateChatLockSalt, validateChatLockPassword,
  setChatLockRuntimeState,
} from './chatLockCore';

/* ------------------------------------------------------------------
 * Chat Lock — server-sync layer (schema SECTION 8).
 *
 * The pure state/crypto lives in chatLockCore.ts (testable, no
 * Supabase). This module owns every network touch:
 *   chat_lock_settings  — master switch + verifier + cool-down state
 *   conversation_locks  — which conversations are protected
 *   verify_chat_lock()  — server-side verifier compare with an
 *                         escalating cool-down after misses.
 * The plaintext chat-lock passcode NEVER leaves the device: only the
 * client-derived PBKDF2-SHA256 (310k) verifier is sent, and only to
 * the verify RPC.
 * ------------------------------------------------------------------ */

export type ChatLockVerifyResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds?: number; attemptsLeft?: number };

const db = () => supabaseClient;

export const fetchChatLockRuntime = async (): Promise<{ enabled: boolean; auto_lock_on_hide: boolean } | null> => {
  if (!db()) return null;
  const { data, error } = await db()!
    .from('chat_lock_settings')
    .select('enabled, auto_lock_on_hide')
    .maybeSingle();
  if (error) return null;
  return data ? { enabled: !!data.enabled, auto_lock_on_hide: data.auto_lock_on_hide !== false } : null;
};

export const fetchProtectedConversations = async (): Promise<string[]> => {
  if (!db()) return [];
  const { data, error } = await db()!
    .from('conversation_locks')
    .select('chat_id');
  if (error) return [];
  return (data || []).map(r => r.chat_id as string);
};

/** Push both server pieces into the in-memory runtime state. */
export const syncChatLockRuntime = async (): Promise<void> => {
  const settings = await fetchChatLockRuntime();
  const ids = settings?.enabled ? await fetchProtectedConversations() : [];
  setChatLockRuntimeState({
    enabled: settings?.enabled ?? false,
    autoLockOnHide: settings?.auto_lock_on_hide ?? true,
    protectedChatIds: ids,
  });
};
/** Enable Chat Lock with a fresh passcode. */
export const enableChatLock = async (
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!db()) return { ok: false, error: 'You need the cloud connection for chat lock.' };
  const v = validateChatLockPassword(password);
  if (v) return { ok: false, error: v };
  const salt = generateChatLockSalt();
  const verifier = await deriveChatLockVerifier(password, salt);
  const { error } = await db()!
    .from('chat_lock_settings')
    .upsert(
      { enabled: true, salt, verifier, auto_lock_on_hide: true, failed_attempts: 0, locked_until: null },
      { ignoreDuplicates: false }
    );
  if (error) return { ok: false, error: error.message || 'Could not enable chat lock.' };
  await syncChatLockRuntime();
  return { ok: true };
};

/** Verify a passcode against the server (rate-limited there). */
export const verifyChatLockPassword = async (
  password: string
): Promise<ChatLockVerifyResult> => {
  if (!db()) return { ok: false, error: 'You need the cloud connection for chat lock.' };
  if (!password) return { ok: false, error: 'Enter your chat lock passcode.' };
  const { data: row, error: rowErr } = await db()!
    .from('chat_lock_settings')
    .select('salt')
    .maybeSingle();
  if (rowErr || !row?.salt) return { ok: false, error: 'Chat lock is not set up.' };
  const verifier = await deriveChatLockVerifier(password, row.salt);
  const { data, error } = await db()!.rpc('verify_chat_lock', { p_verifier: verifier });
  if (error) return { ok: false, error: error.message || 'Could not verify the passcode.' };
  if (data?.ok) return { ok: true };
  const kind = String(data?.error || 'wrong_password');
  if (kind === 'rate_limited') {
    const wait = Number(data?.retry_after || 30);
    return {
      ok: false,
      error: `Too many attempts — wait ${wait} second${wait === 1 ? '' : 's'} and try again.`,
      retryAfterSeconds: wait,
    };
  }
  const left = Number(data?.attempts_left ?? 0);
  return {
    ok: false,
    error: left > 0
      ? `That passcode isn't right. ${left} tr${left === 1 ? 'y' : 'ies'} left.`
      : "That passcode isn't right.",
    attemptsLeft: left,
  };
};

/** Change the passcode (old passcode verified server-side first). */
export const changeChatLockPassword = async (
  oldPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const check = await verifyChatLockPassword(oldPassword);
  if (!check.ok) return { ok: false, error: check.error };
  const v = validateChatLockPassword(newPassword);
  if (v) return { ok: false, error: v };
  const salt = generateChatLockSalt();
  const verifier = await deriveChatLockVerifier(newPassword, salt);
  const { error } = await db()!
    .from('chat_lock_settings')
    .update({ salt, verifier, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq('enabled', true);
  if (error) return { ok: false, error: error.message || 'Could not change the passcode.' };
  return { ok: true };
};

/** Auto-lock policy: lock protected conversations when the tab hides. */
export const setChatLockAutoLock = async (
  onHide: boolean
): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!db()) return { ok: false, error: 'You need the cloud connection for chat lock.' };
  const { error } = await db()!
    .from('chat_lock_settings')
    .update({ auto_lock_on_hide: onHide })
    .eq('enabled', true);
  if (error) return { ok: false, error: error.message || 'Could not update the setting.' };
  await syncChatLockRuntime();
  return { ok: true };
};

/** Turn Chat Lock off entirely (removes protection from every chat). */
export const disableChatLock = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!db()) return { ok: false, error: 'You need the cloud connection for chat lock.' };
  // conversation_locks first (FK has cascade, but explicit is honest), then settings.
  const { error } = await db()!.from('conversation_locks').delete().neq('chat_id', '00000000-0000-0000-0000-000000000000');
  if (error) return { ok: false, error: error.message || 'Could not clear protected chats.' };
  const { error: err2 } = await db()!.from('chat_lock_settings').delete();
  if (err2) return { ok: false, error: err2.message || 'Could not remove chat lock.' };
  await syncChatLockRuntime();
  return { ok: true };
};

/** Protect / unprotect one conversation. */
export const setConversationLocked = async (
  chatId: string,
  locked: boolean
): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!db()) return { ok: false, error: 'You need the cloud connection for chat lock.' };
  if (locked) {
    const { error } = await db()!.from('conversation_locks').insert({ chat_id: chatId });
    if (error) return { ok: false, error: error.message || 'Could not protect this chat.' };
  } else {
    const { error } = await db()!.from('conversation_locks').delete().eq('chat_id', chatId);
    if (error) return { ok: false, error: error.message || 'Could not unprotect this chat.' };
  }
  await syncChatLockRuntime();
  return { ok: true };
};
