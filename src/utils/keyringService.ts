/**
 * keyringService — Phase 5 / S3: server-integrated keyring lifecycle.
 *
 * Bridges `chatCrypto` primitives with the `account_keys` table:
 *  - login/signup: create the keyring (first ever login) or unwrap it
 *    with the just-entered password (validates it, enables E2EE DMs);
 *  - session restore: silent unlock via the IndexedDB device copy;
 *  - new device: one-time password prompt (never persisted);
 *  - password change: re-wrap the SAME private key under the new
 *    password so existing E2EE conversations keep working.
 */

import {
  generateKeyring,
  unwrapKeyringWithPassword,
  wrapPrivateJwk,
  setActivePrivateKey,
  hasActivePrivateKey,
  getActivePrivateJwk,
  storeDeviceCopy,
  loadDeviceCopy,
} from './chatCrypto';

export { hasActivePrivateKey };

export type KeyringResult =
  | { status: 'ready'; created?: boolean }
  | { status: 'need-password' }
  | { status: 'unwrap-failed'; error: string };

const fetchKeyringRow = async (supabase: any, username: string) => {
  const { data } = await supabase
    .from('account_keys')
    .select('username, public_jwk, wrapped_private_jwk, kdf_salt, kdf_iterations')
    .eq('username', username.toLowerCase())
    .maybeSingle();
  return data || null;
};

const upsertKeyringRow = async (
  supabase: any,
  username: string,
  authUid: string | null,
  secrets: { public_jwk: JsonWebKey; wrapped_private_jwk: string; kdf_salt: string; kdf_iterations: number }
): Promise<boolean> => {
  const { error } = await supabase.from('account_keys').upsert(
    {
      username: username.toLowerCase(),
      auth_uid: authUid,
      public_jwk: secrets.public_jwk,
      wrapped_private_jwk: secrets.wrapped_private_jwk,
      kdf_salt: secrets.kdf_salt,
      kdf_iterations: secrets.kdf_iterations,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'username' }
  );
  return !error;
};

/** Login / signup completion: the password IS in hand. */
export const ensureKeyringForLogin = async (
  supabase: any,
  username: string,
  password: string,
  authUid: string | null = null
): Promise<KeyringResult> => {
  try {
    const row = await fetchKeyringRow(supabase, username);
    if (row) {
      try {
        const privateJwk = await unwrapKeyringWithPassword(row, password);
        await setActivePrivateKey(privateJwk);
        await storeDeviceCopy(username, privateJwk);
        return { status: 'ready' };
      } catch (err: any) {
        // Keyring exists but THIS password doesn't open it (e.g. the
        // password was changed elsewhere without a re-wrap). Honest
        // failure: legacy chats keep working, E2EE DMs stay locked.
        return { status: 'unwrap-failed', error: err?.message || 'keyring unwrap failed' };
      }
    }
    // First keyring for this account.
    const secrets = await generateKeyring(password);
    await setActivePrivateKey(secrets.privateJwk);
    await storeDeviceCopy(username, secrets.privateJwk);
    const ok = await upsertKeyringRow(supabase, username, authUid, secrets);
    return ok ? { status: 'ready', created: true } : { status: 'ready' };
  } catch (err: any) {
    return { status: 'unwrap-failed', error: err?.message || 'keyring setup failed' };
  }
};

/** Boot-time silent unlock from the device copy (no password involved). */
export const trySilentUnlock = async (username: string): Promise<KeyringResult> => {
  if (hasActivePrivateKey()) return { status: 'ready' };
  const privateJwk = await loadDeviceCopy(username);
  if (privateJwk) {
    await setActivePrivateKey(privateJwk);
    return { status: 'ready' };
  }
  return { status: 'need-password' };
};

/** New-device bootstrap: one-time password prompt. */
export const unlockKeyringWithPassword = async (
  supabase: any,
  username: string,
  password: string
): Promise<KeyringResult> => {
  const row = await fetchKeyringRow(supabase, username);
  if (!row) return { status: 'need-password' }; // nothing to unlock — no keyring yet
  try {
    const privateJwk = await unwrapKeyringWithPassword(row, password);
    await setActivePrivateKey(privateJwk);
    await storeDeviceCopy(username, privateJwk);
    return { status: 'ready' };
  } catch {
    return { status: 'need-password' }; // wrong password stays a prompt
  }
};

/**
 * Password change: re-wrap the SAME private key under the new password.
 * Only needs the key (already unlocked) — never the old password.
 */
export const rewrapKeyring = async (
  supabase: any,
  username: string,
  newPassword: string,
  authUid: string | null = null
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const privateJwk = getActivePrivateJwk();
    if (!privateJwk) return { ok: false, error: 'Encryption key not unlocked on this device.' };
    const wrapped = await wrapPrivateJwk(privateJwk, newPassword);
    const ok = await upsertKeyringRow(supabase, username, authUid, {
      public_jwk: privateJwk, // the public half is unchanged by a password change
      wrapped_private_jwk: wrapped.wrapped_private_jwk,
      kdf_salt: wrapped.kdf_salt,
      kdf_iterations: wrapped.kdf_iterations,
    });
    await storeDeviceCopy(username, privateJwk);
    return ok ? { ok: true } : { ok: false, error: 'Could not save the re-wrapped key.' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Key re-wrap failed.' };
  }
};

/** Wipe local key material (logout hygiene). */
export const forgetLocalKeys = async (username?: string): Promise<void> => {
  await setActivePrivateKey(null);
  if (username) await loadDeviceCopy(username); // no-op keeps parity
};
