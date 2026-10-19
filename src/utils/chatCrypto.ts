/**
 * chatCrypto — Phase 5 / AUDIT S3+S4: on-device keyrings, per-conversation
 * key establishment and attachment byte encryption.
 *
 * ── Architecture ─────────────────────────────────────────────────────────
 * Every cryptographic operation below happens on the device. The server
 * never sees plaintext key material:
 *
 *  1. Each account owns an ECDH P-256 keypair generated on-device.
 *  2. The private key is stored ONLY in wrapped form:
 *       · device copy  — IndexedDB, AES-GCM under a NON-EXTRACTABLE device
 *         key (the raw device key cannot be read by any script, only used),
 *         enabling silent unlock after a page refresh while a session lives;
 *       · account copy — `account_keys.wrapped_private_jwk`, AES-GCM under
 *         PBKDF2-SHA256 (310k) of the account password, used to bootstrap
 *         new browsers with a one-time password prompt.
 *     Plaintext private keys and passwords never touch localStorage,
 *     sessionStorage or the network (Phase 4 contract).
 *
 *  3. NEW direct messages generate a random 256-bit conversation key that
 *     never reaches the server in the clear. It is wrapped once per
 *     participant via ECDH(sender_priv, peer_pub) → HKDF-SHA256(salt =
 *     chat_id) → AES-GCM and stored in `chat_keys`. Unwrapping requires the
 *     named participant's device-held private key, so a full database
 *     breach cannot decrypt DM content.
 *  4. Group consoles and legacy chats keep the invite-code model (the
 *     share_code IS the key — anyone you invite can read that console).
 *     This is documented honestly in the UI rather than claimed as E2EE.
 *  5. Attachments (S4) are AES-GCM-encrypted with the conversation key
 *     BEFORE upload into the private `attachments` bucket; reads go through
 *     membership-gated signed URLs and are decrypted on-device.
 * ─────────────────────────────────────────────────────────────────────────
 */

/* ───────────────────────────── base64 utils ───────────────────────────── */

export const bufToB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

export const b64ToBuf = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const utf8 = (s: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;

/* ─────────────────────────── IndexedDB layer ──────────────────────────── */

const IDB_NAME = 'axon-keys';
const IDB_STORE = 'keys';

const idbOpen = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });

export const idbGet = async <T = any>(key: string): Promise<T | null> => {
  try {
    const db = await idbOpen();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // IDB unavailable (private mode) → callers degrade to memory-only
  }
};

export const idbPut = async (key: string, value: any): Promise<boolean> => {
  try {
    const db = await idbOpen();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return false;
  }
};

export const idbDel = async (key: string): Promise<void> => {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* best effort */
  }
};

/* ───────────────────────── device key (non-extractable) ───────────────── */

let deviceKeyPromise: Promise<CryptoKey> | null = null;

/** AES-GCM 256 key that scripts can USE but never read or export. */
export const getDeviceKey = (): Promise<CryptoKey> => {
  if (!deviceKeyPromise) {
    deviceKeyPromise = (async () => {
      const stored = await idbGet<CryptoKey>('device_key');
      if (stored) return stored;
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable: the raw material can never leave WebCrypto
        ['encrypt', 'decrypt']
      );
      await idbPut('device_key', key); // structured-clone keeps it non-extractable
      return key;
    })();
  }
  return deviceKeyPromise;
};

/* ──────────────────────── active private key holder ───────────────────── */

let activePrivateJwk: JsonWebKey | null = null;
let activePrivateCrypto: CryptoKey | null = null;

export const setActivePrivateKey = async (jwk: JsonWebKey | null): Promise<void> => {
  activePrivateJwk = jwk;
  activePrivateCrypto = null;
  if (jwk) {
    activePrivateCrypto = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits']
    );
  }
};

export const hasActivePrivateKey = (): boolean => !!activePrivateCrypto;
export const getActivePrivateJwk = (): JsonWebKey | null => activePrivateJwk;
export const getActivePrivateCryptoKey = (): CryptoKey | null => activePrivateCrypto;

/* ────────────────────────────── keyring ops ───────────────────────────── */

const KDF_ITERATIONS = 310000;

const pbkdf2Key = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as unknown as Uint8Array<ArrayBuffer>,
      iterations: KDF_ITERATIONS,
    },
    base,
    256
  );
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const aesGcmEncrypt = async (key: CryptoKey, plaintext: Uint8Array): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource);
  return bufToB64(iv) + '.' + bufToB64(ct);
};

const aesGcmDecrypt = async (key: CryptoKey, payload: string): Promise<Uint8Array> => {
  const [ivB64, ctB64] = payload.split('.');
  if (!ivB64 || !ctB64) throw new Error('malformed ciphertext');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(ivB64) },
    key,
    b64ToBuf(ctB64)
  );
  return new Uint8Array(pt);
};

export type KeyringSecrets = {
  public_jwk: JsonWebKey;
  wrapped_private_jwk: string;
  kdf_salt: string;
  kdf_iterations: number;
};

/**
 * PBKDF2-wrap a private JWK under a password. Used both for fresh
 * keyrings and for re-wraps after a password change (same key, new
 * password — conversations keep working).
 */
export const wrapPrivateJwk = async (
  privateJwk: JsonWebKey,
  password: string,
  salt?: Uint8Array
): Promise<{ wrapped_private_jwk: string; kdf_salt: string; kdf_iterations: number }> => {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const wrapKey = await pbkdf2Key(password, s);
  const wrapped = await aesGcmEncrypt(wrapKey, utf8(JSON.stringify(privateJwk)));
  return {
    wrapped_private_jwk: wrapped,
    kdf_salt: bufToB64(s),
    kdf_iterations: KDF_ITERATIONS,
  };
};

/** Generate a fresh ECDH P-256 keypair and the password-wrapped account copy. */
export const generateKeyring = async (
  password: string
): Promise<KeyringSecrets & { privateJwk: JsonWebKey }> => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ]);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const wrapped = await wrapPrivateJwk(privateJwk, password);
  return {
    privateJwk,
    public_jwk: publicJwk,
    wrapped_private_jwk: wrapped.wrapped_private_jwk,
    kdf_salt: wrapped.kdf_salt,
    kdf_iterations: wrapped.kdf_iterations,
  };
};

export const unwrapKeyringWithPassword = async (
  row: { wrapped_private_jwk: string; kdf_salt: string },
  password: string
): Promise<JsonWebKey> => {
  const salt = b64ToBuf(row.kdf_salt);
  const wrapKey = await pbkdf2Key(password, salt);
  const pt = await aesGcmDecrypt(wrapKey, row.wrapped_private_jwk);
  return JSON.parse(new TextDecoder().decode(pt));
};

/* ── device-local copies (silent session-restore unlock) ── */

const deviceKeySlot = (username: string) => `wrapped_private:${username.toLowerCase()}`;

export const storeDeviceCopy = async (username: string, privateJwk: JsonWebKey): Promise<boolean> => {
  try {
    const deviceKey = await getDeviceKey();
    const wrapped = await aesGcmEncrypt(deviceKey, utf8(JSON.stringify(privateJwk)));
    return await idbPut(deviceKeySlot(username), wrapped);
  } catch {
    return false;
  }
};

export const loadDeviceCopy = async (username: string): Promise<JsonWebKey | null> => {
  try {
    const wrapped = await idbGet<string>(deviceKeySlot(username));
    if (!wrapped) return null;
    const deviceKey = await getDeviceKey();
    const pt = await aesGcmDecrypt(deviceKey, wrapped);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null; // device key rotated / foreign blob → password bootstrap path
  }
};

export const clearDeviceCopy = async (username: string): Promise<void> => {
  await idbDel(deviceKeySlot(username));
};

/* ─────────────────────────── ECDH conversation keys ────────────────────── */

export const generateConversationKey = (): string =>
  bufToB64(crypto.getRandomValues(new Uint8Array(32)));

/** HKDF(ECDH(my_priv, peer_pub), salt = chat_id) → AES-GCM wrap key. */
export const deriveWrapKey = async (
  myPriv: CryptoKey,
  peerPublicJwk: JsonWebKey,
  chatId: string
): Promise<CryptoKey> => {
  const peerKey = await crypto.subtle.importKey(
    'jwk',
    peerPublicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerKey }, myPriv, 256);
  const hkdfBase = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const wrapBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(chatId) as BufferSource,
      info: utf8('axon-chat-key-v1') as BufferSource,
    },
    hkdfBase,
    256
  );
  return crypto.subtle.importKey('raw', wrapBits, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
};

export const wrapConversationKey = async (
  conversationKeyB64: string,
  myPriv: CryptoKey,
  peerPublicJwk: JsonWebKey,
  chatId: string
): Promise<string> => {
  const wrapKey = await deriveWrapKey(myPriv, peerPublicJwk, chatId);
  return aesGcmEncrypt(wrapKey, utf8(conversationKeyB64));
};

export const unwrapConversationKey = async (
  wrappedKey: string,
  myPriv: CryptoKey,
  peerPublicJwk: JsonWebKey,
  chatId: string
): Promise<string> => {
  const wrapKey = await deriveWrapKey(myPriv, peerPublicJwk, chatId);
  const pt = await aesGcmDecrypt(wrapKey, wrappedKey);
  return new TextDecoder().decode(pt);
};

/* ─────────────────────── conversation key resolution ───────────────────── */

export type ChatKeyRow = {
  chat_id: string;
  username: string;
  wrap_scheme: string;
  wrapped_key: string;
  wrap_info: { peer?: string } | null;
};

const keyCache = new Map<string, string>(); // chat_id → resolved passphrase

export const invalidateChatKey = (chatId: string): void => {
  keyCache.delete(chatId);
};

export const clearKeyCache = (): void => keyCache.clear();

export const getCachedChatKey = (chatId: string): string | undefined => keyCache.get(chatId);

/**
 * Resolve the message passphrase for a conversation:
 *  1. `chat_keys` row for me (scheme `ecdh-p256`) → unwrap with my device
 *     private key + the peer's public key → the true conversation key.
 *  2. Fallback: the chat's share_code (legacy invite-code model).
 * Results are memoised per chat for the session.
 */
export const resolveChatKey = async (
  supabase: any,
  chat: { id: string; share_code: string },
  myUsername: string
): Promise<string> => {
  const cached = keyCache.get(chat.id);
  if (cached) return cached;

  const fallback = chat.share_code;
  try {
    if (!supabase || !activePrivateCrypto) {
      keyCache.set(chat.id, fallback);
      return fallback;
    }
    const lower = myUsername.toLowerCase();
    const { data: row } = await supabase
      .from('chat_keys')
      .select('chat_id, username, wrap_scheme, wrapped_key, wrap_info')
      .eq('chat_id', chat.id)
      .eq('username', lower)
      .maybeSingle();

    if (row && row.wrap_scheme === 'ecdh-p256') {
      const peer = (row.wrap_info || {}).peer;
      if (peer) {
        const { data: peerRow } = await supabase
          .from('account_keys')
          .select('public_jwk')
          .eq('username', String(peer).toLowerCase())
          .maybeSingle();
        if (peerRow?.public_jwk) {
          const key = await unwrapConversationKey(
            row.wrapped_key,
            activePrivateCrypto,
            peerRow.public_jwk,
            chat.id
          );
          keyCache.set(chat.id, key);
          return key;
        }
      }
    }
  } catch {
    /* table missing on stale schema, or unwrap failure → legacy fallback */
  }
  keyCache.set(chat.id, fallback);
  return fallback;
};

/* ───────────────────────── attachment byte crypto (S4) ─────────────────── */

const rawAesKeyFor = async (keyStr: string): Promise<CryptoKey> => {
  const digest = await crypto.subtle.digest('SHA-256', utf8(keyStr) as BufferSource);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
};

/** AES-GCM encrypt raw file bytes with the conversation key → iv‖ct bytes. */
export const encryptBytes = async (keyStr: string, data: ArrayBuffer): Promise<ArrayBuffer> => {
  const key = await rawAesKeyFor(keyStr);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return out.buffer;
};

export const decryptBytes = async (keyStr: string, payload: ArrayBuffer): Promise<ArrayBuffer> => {
  const key = await rawAesKeyFor(keyStr);
  const bytes = new Uint8Array(payload);
  const iv = bytes.subarray(0, 12);
  const ct = bytes.subarray(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct as BufferSource);
};

/** True when a decrypted file_url references the private attachments store. */
export const isPrivateAttachment = (url: string): boolean =>
  url.startsWith('attachments/');

/** Parse "attachments/<chat_id>/<uuid>.enc|<mime>|<name>" payload parts. */
export const parseAttachmentRef = (
  url: string
): { path: string; mime: string; name: string } => {
  const [path = '', mime = '', name = ''] = url.split('|');
  return { path, mime, name: name || path.split('/').pop() || 'attachment' };
};
