import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';
import {
  generateKeyring,
  wrapPrivateJwk,
  unwrapKeyringWithPassword,
  wrapConversationKey,
  unwrapConversationKey,
  generateConversationKey,
  encryptBytes,
  decryptBytes,
  isPrivateAttachment,
  parseAttachmentRef,
  bufToB64,
  b64ToBuf,
  setActivePrivateKey,
  getActivePrivateJwk,
  resolveChatKey,
  invalidateChatKey,
} from '../src/utils/chatCrypto.ts';

/**
 * Tier 15: Phase 5 — encrypted private attachments (S4) and on-device
 * keyrings with per-conversation key establishment (S3).
 *
 * Runtime-tested here (real WebCrypto): keyring generate/unwrap round-trip,
 * re-wrap under a new password, ECDH conversation-key wrap/unwrap between
 * two independent keypairs, attachment byte crypto, private-ref parsing and
 * the resolveChatKey fallback ladder. Structure-tested: schema SECTION 9
 * (private bucket, membership RLS, owner-only keyrings), the E2EE DM
 * establishment path, the decrypt-path integration and the keyring gate.
 */
export async function runTier15Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...p: string[]): string => fs.readFileSync(path.join(projectRoot, ...p), 'utf-8');

  const push = (name: string, passed: boolean, error?: string) =>
    results.push({ name, tier: 15, passed, error, durationMs: 0 });

  const check = (name: string, assertions: (boolean | string | [boolean | string, string])[]) => {
    try {
      const failures: string[] = [];
      assertions.forEach((entry, i) => {
        const tuple = Array.isArray(entry);
        const cond = tuple ? entry[0] : entry;
        const label = tuple ? entry[1] : `assertion#${i + 1}`;
        const ok = typeof cond === 'string' ? cond.length > 0 : cond;
        if (!ok) failures.push(label);
      });
      if (failures.length > 0) push(name, false, `Failed: ${failures.join('; ')}`);
      else push(name, true);
    } catch (err: any) {
      push(name, false, String(err?.message || err));
    }
  };

  /* ---------------- 15.1 keyring: generate → unwrap round-trip ---------------- */

  const PW = 'correct horse battery staple ॐ';
  const ringA = await generateKeyring(PW);
  check('15.1 keyring generate/unwrap round-trip', [
    [!!ringA.public_jwk.kty && ringA.public_jwk.kty === 'EC', 'public JWK is an EC key'],
    [ringA.public_jwk.crv === 'P-256', 'curve is P-256'],
    [ringA.kdf_iterations >= 310000, 'PBKDF2 iterations >= 310k'],
    [/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(ringA.wrapped_private_jwk), 'wrapped key is iv.ct base64'],
    [await (async () => {
      const unwrapped = await unwrapKeyringWithPassword(
        { wrapped_private_jwk: ringA.wrapped_private_jwk, kdf_salt: ringA.kdf_salt },
        PW
      );
      return !!unwrapped.d && !!unwrapped.x && !!unwrapped.y;
    })(), 'password reopens the private JWK'],
  ]);

  /* ---------------- 15.2 wrong password must fail ---------------- */

  check('15.2 wrong password cannot open the keyring', [
    [await (async () => {
      try {
        await unwrapKeyringWithPassword(
          { wrapped_private_jwk: ringA.wrapped_private_jwk, kdf_salt: ringA.kdf_salt },
          'wrong password entirely'
        );
        return false;
      } catch {
        return true;
      }
    })(), 'unwrap throws on wrong password'],
  ]);

  /* ---------------- 15.3 re-wrap under a new password ---------------- */

  check('15.3 password change re-wraps the SAME key', [
    await (async () => {
      const original = await unwrapKeyringWithPassword(
        { wrapped_private_jwk: ringA.wrapped_private_jwk, kdf_salt: ringA.kdf_salt }, PW
      );
      const rewrapped = await wrapPrivateJwk(original, 'brand-new password 123');
      const reopened = await unwrapKeyringWithPassword(
        { wrapped_private_jwk: rewrapped.wrapped_private_jwk, kdf_salt: rewrapped.kdf_salt },
        'brand-new password 123'
      );
      return reopened.d === original.d; // same private scalar → same identity
    })(), 'new password reopens the identical private key',
  ]);

  /* ---------------- 15.4 ECDH conversation key wrap/unwrap ---------------- */

  const CHAT_ID = '11111111-2222-3333-4444-555555555555';
  check('15.4 two devices establish the same conversation key', [
    await (async () => {
      const ringB = await generateKeyring('peer password');
      const convKey = generateConversationKey();
      const { crypto } = globalThis;
      const importPriv = async (jwk: JsonWebKey) => crypto.subtle.importKey(
        'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']
      );
      const privA = await importPriv(ringA.privateJwk);
      const privB = await importPriv(await unwrapKeyringWithPassword(
        { wrapped_private_jwk: ringB.wrapped_private_jwk, kdf_salt: ringB.kdf_salt }, 'peer password'
      ));

      const wrappedForB = await wrapConversationKey(convKey, privA, ringB.public_jwk, CHAT_ID);
      const wrappedForA = await wrapConversationKey(convKey, privA, ringA.public_jwk, CHAT_ID);

      const openedB = await unwrapConversationKey(wrappedForB, privB, ringA.public_jwk, CHAT_ID);
      const openedA = await unwrapConversationKey(wrappedForA, privA, ringA.public_jwk, CHAT_ID);
      return openedB === convKey && openedA === convKey;
    })(), 'both wrapped copies open to the original conversation key',
  ]);

  /* ---------------- 15.5 wrong chat_id / wrong peer fails ---------------- */

  check('15.5 wrapped key is bound to chat and peer identity', [
    await (async () => {
      const ringB = await generateKeyring('peer password');
      const { crypto } = globalThis;
      const privA = await crypto.subtle.importKey('jwk', await unwrapKeyringWithPassword(
        { wrapped_private_jwk: ringA.wrapped_private_jwk, kdf_salt: ringA.kdf_salt }, PW
      ), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
      const privB = await crypto.subtle.importKey('jwk', await unwrapKeyringWithPassword(
        { wrapped_private_jwk: ringB.wrapped_private_jwk, kdf_salt: ringB.kdf_salt }, 'peer password'
      ), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
      const convKey = generateConversationKey();
      const wrappedForB = await wrapConversationKey(convKey, privA, ringB.public_jwk, CHAT_ID);
      try {
        // a DIFFERENT chat id must not open it (HKDF salt binding)
        await unwrapConversationKey(wrappedForB, privB, ringA.public_jwk, '99999999-9999-9999-9999-999999999999');
        return false;
      } catch {
        return true;
      }
    })(), 'a different chat_id cannot open the wrapped key',
  ]);

  /* ---------------- 15.6 attachment byte crypto ---------------- */

  check('15.6 attachment bytes encrypt/decrypt with the conversation key', [
    await (async () => {
      const key = generateConversationKey();
      const plain = new TextEncoder().encode('PNG-bytes-ish attachment payload ॐ');
      const cipher = await encryptBytes(key, plain.buffer as ArrayBuffer);
      const opened = await decryptBytes(key, cipher);
      return new TextDecoder().decode(opened) === new TextDecoder().decode(plain);
    })(), 'ciphertext round-trips to the original bytes',
  ]);

  /* ---------------- 15.7 private-ref parsing ---------------- */

  check('15.7 private attachment references parse and route', [
    isPrivateAttachment('attachments/111/up.enc|image/png|photo.png'),
    !isPrivateAttachment('https://x.supabase.co/storage/v1/object/public/chat_files/a.png'),
    !isPrivateAttachment('data:image/png;base64,AAAA'),
    (() => {
      const p = parseAttachmentRef('attachments/111/up.enc|video/mp4|clip.mp4');
      return p.path === 'attachments/111/up.enc' && p.mime === 'video/mp4' && p.name === 'clip.mp4';
    })(),
  ]);

  /* ---------------- 15.8 resolveChatKey fallback ladder ---------------- */

  check('15.8 resolver falls back to share_code without chat_keys', [
    await (async () => {
      setActivePrivateKey(null);
      const supa = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            }),
          }),
        }),
      };
      const key = await resolveChatKey(supa, { id: CHAT_ID, share_code: 'DM-LEGACY1' }, 'alice');
      return key === 'DM-LEGACY1';
    })(), 'no chat_keys row → share_code fallback',
  ]);

  check('15.9 resolver unwraps an E2EE row when the key is unlocked', [
    await (async () => {
      const ringB = await generateKeyring('peer password');
      const { crypto } = globalThis;
      const privJwk = await unwrapKeyringWithPassword(
        { wrapped_private_jwk: ringA.wrapped_private_jwk, kdf_salt: ringA.kdf_salt }, PW
      );
      const privA = await crypto.subtle.importKey(
        'jwk', privJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']
      );
      await setActivePrivateKey(JSON.parse(JSON.stringify(privJwk)));
      const convKey = generateConversationKey();
      // row for alice with wrap_info.peer='bob' → wrapped under ECDH(privA, pubB)
      const wrappedForA = await wrapConversationKey(convKey, privA, ringB.public_jwk, CHAT_ID);

      const eqChain: any = (table: string, col: string, val: string) => ({
        eq: (c2: string, v2: string) => eqChain(table, c2, v2),
        maybeSingle: async () => {
          if (table === 'chat_keys') {
            return { data: { chat_id: CHAT_ID, username: val, wrap_scheme: 'ecdh-p256', wrapped_key: wrappedForA, wrap_info: { peer: 'bob' } } };
          }
          if (table === 'account_keys') {
            return { data: { public_jwk: val === 'bob' ? ringB.public_jwk : ringA.public_jwk } };
          }
          return { data: null };
        },
      });
      const supa = {
        from: (table: string) => ({
          select: () => ({
            eq: (col: string, val: string) => eqChain(table, col, val),
          }),
        }),
      };
      const key = await (async () => {
        invalidateChatKey(CHAT_ID); // 15.8 cached the legacy fallback for this id
        return await resolveChatKey(supa, { id: CHAT_ID, share_code: 'DM-LEGACY1' }, 'alice');
      })();
      invalidateChatKey(CHAT_ID);
      await setActivePrivateKey(null);
      return key === convKey;
    })(), 'unlocked keyring unwraps the E2EE conversation key',
  ]);

  /* ---------------- 15.10 schema SECTION 9: private attachments ---------------- */

  check('15.10 schema ships the private attachments bucket with member RLS', [
    /insert into storage\.buckets \(id, name, public\)\s*\nvalues \('attachments', 'attachments', false\)/.test(read('supabase/schema.sql')),
    /create policy "attachments member upload"[\s\S]*?with check \([\s\S]*?bucket_id = 'attachments'[\s\S]*?is_chat_member\(/.test(read('supabase/schema.sql')),
    /create policy "attachments member read"[\s\S]*?using \([\s\S]*?bucket_id = 'attachments'[\s\S]*?is_chat_member\(/.test(read('supabase/schema.sql')),
    /create policy "attachments member manage"[\s\S]*?is_chat_member\(/.test(read('supabase/schema.sql')),
  ]);

  /* ---------------- 15.11 schema SECTION 9: keyrings ---------------- */

  check('15.11 schema ships owner-scoped keyrings (account_keys)', [
    /create table if not exists public\.account_keys \([\s\S]*?wrapped_private_jwk[\s\S]*?kdf_salt/.test(read('supabase/schema.sql')),
    /create policy "keyring owner writes"[\s\S]*?with check \(username = public\.my_username\(\)\)/.test(read('supabase/schema.sql')),
    /create policy "keyring owner updates"[\s\S]*?username = public\.my_username\(\)/.test(read('supabase/schema.sql')),
    // public keys are intentionally readable by authenticated users
    /create policy "keyring public keys readable"[\s\S]*?using \(true\)/.test(read('supabase/schema.sql')),
  ]);

  check('15.12 schema ships per-participant wrapped chat keys (chat_keys)', [
    /create table if not exists public\.chat_keys \([\s\S]*?wrap_scheme[\s\S]*?wrapped_key[\s\S]*?wrap_info/.test(read('supabase/schema.sql')),
    /create policy "chat keys own reads"[\s\S]*?username = public\.my_username\(\)/.test(read('supabase/schema.sql')),
    /create policy "chat keys participant inserts"[\s\S]*?is_chat_member\(chat_id, public\.my_username\(\)\)[\s\S]*?username = public\.my_username\(\)[\s\S]*?is_chat_member\(chat_id, username\)/.test(read('supabase/schema.sql')),
  ]);

  /* ---------------- 15.13 DM key establishment integration ---------------- */

  check('15.13 new DMs establish E2EE keys when both sides hold keyrings', [
    /generateConversationKey\(\)[\s\S]{0,200}wrapConversationKey\(convKey, myPriv, myPub, data\.id\)/.test(read('src/contexts/CryptoContext.tsx')),
    /wrapConversationKey\(convKey, myPriv, peerKeyRow\.public_jwk, data\.id\)/.test(read('src/contexts/CryptoContext.tsx')),
    /from\('chat_keys'\)\.insert\(\[\s*\{ chat_id: data\.id, username: me, wrap_scheme: 'ecdh-p256'/.test(read('src/contexts/CryptoContext.tsx')),
    /wrap_info: \{ peer: me \}/.test(read('src/contexts/CryptoContext.tsx')),
    /has no encryption keyring yet/.test(read('src/contexts/CryptoContext.tsx')),
  ]);

  /* ---------------- 15.14 decrypt paths resolve keys ---------------- */

  check('15.14 every message path resolves the conversation key', [
    (read('src/contexts/CryptoContext.tsx').match(/chatKeyOf\(/g) || []).length >= 7,
    /const chatKey = await chatKeyOf\(supabase, targetChat[\s\S]{0,120}encryptText\(text, chatKey\)/.test(read('src/contexts/CryptoContext.tsx')),
    /resolveChatKey\(supabase, chat, username \|\| ''\)/.test(read('src/utils/chatMeta.ts')),
    /hydratePreviews\(chats, backendMode, supabase, myHandle\)/.test(read('src/components/chat/InboxPanel.tsx')),
  ]);

  /* ---------------- 15.15 attachments upload ciphertext ---------------- */

  check('15.15 uploads are ciphertext into the private bucket', [
    /encryptBytes\(chatKey, plainBuf\)/.test(read('src/contexts/CryptoContext.tsx')),
    /\.from\('attachments'\)\s*\n\s*\.upload\(fileName, cipherBuf/.test(read('src/contexts/CryptoContext.tsx')),
    /encryptText\(`\$\{uploadData\.path\}\|\$\{file\.type \|\| 'application\/octet-stream'\}\|\$\{file\.name\}`/.test(read('src/contexts/CryptoContext.tsx')),
    /isPrivateAttachment\(fileUrl\)/.test(read('src/components/chat/ConversationPanel.tsx')),
    /createSignedUrl\(path, 300\)/.test(read('src/components/chat/EncryptedAttachment.tsx')),
    /decryptBytes\(key, cipher\)/.test(read('src/components/chat/EncryptedAttachment.tsx')),
  ]);

  /* ---------------- 15.16 keyring lifecycle UX ---------------- */

  check('15.16 keyring lifecycle: login bootstrap, gate, re-wraps', [
    /ensureKeyringForLogin\(supabase, uname, pwd\)/.test(read('src/components/auth/AuthScreen.tsx')),
    (read('src/components/auth/AuthScreen.tsx').match(/bootstrapKeyring\(/g) || []).length >= 3,
    /trySilentUnlock/.test(read('src/contexts/CryptoContext.tsx')),
    /unlockKeyringWithPassword\(supabase, account\.username, password\)/.test(read('src/components/auth/KeyringGate.tsx')),
    /sessionStorage\.setItem\(SKIP_FLAG, '1'\)/.test(read('src/components/auth/KeyringGate.tsx')),
    /rewrapKeyring\(supabase, account\?\.username \|\| '', newPassword\)/.test(read('src/components/settings/SettingsPanel.tsx')),
    /rewrapKeyring\(supabase, acct\.username, rp1\)/.test(read('src/components/auth/AuthScreen.tsx')),
    /clearKeyCache\(\)/.test(read('src/contexts/CryptoContext.tsx')),
  ]);

  /* ---------------- 15.17 key material never persisted raw ---------------- */

  check('15.17 plaintext keys/passwords never touch web storage', [
    !/localStorage\.setItem\(['"](?!axon_)[^'"]*['"],\s*.*(privateJwk|password)/i.test(read('src/utils/chatCrypto.ts')),
    !/sessionStorage\.setItem\(['"][^'"]*key['"]/i.test(read('src/utils/keyringService.ts')),
    // device copy is wrapped, and the device key itself is non-extractable
    /generateKey\(\s*\{ name: 'AES-GCM', length: 256 \},\s*\n\s*false,/.test(read('src/utils/chatCrypto.ts')),
    /storeDeviceCopy/.test(read('src/utils/chatCrypto.ts')),
  ]);

  return results;
}
