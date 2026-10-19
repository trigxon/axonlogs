import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 17: the owner's refinement pass — Instagram-exact placement.
 * 17.1 schema — vanishing messages (seen + leave semantics) server-side
 * 17.2 inbox — Instagram-style right-click / long-press context menu
 *      with Lock chat / Mute / Delete, driving the Phase-4 lock system
 * 17.3 composer — vanish mode is a SEPARATE dedicated toggle (Ghost),
 *      distinct from the per-message burn-on-read Flame
 * 17.4 admin — the owner panel lives at /admin only, server-gated
 */
export async function runTier17Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...parts: string[]) =>
    fs.readFileSync(path.join(projectRoot, ...parts), 'utf-8');

  const schemaStart = Date.now();
  try {
    const schema = read('supabase', 'schema.sql');
    const checks: Array<[boolean, string]> = [
      [schema.includes('add column vanish boolean not null default false'), 'messages must carry the vanish flag'],
      [schema.includes('vanish_seen_messages'), 'a member-gated RPC must sweep seen vanishing messages on leave'],
      [schema.includes('and cardinality(read_by) > 0'), 'only SEEN vanishing messages may be swept'],
      [schema.includes('unsent = true, vanish = true'), 'the sweep tombstones content for everyone (text + file + reactions)'],
      [schema.includes('revoke execute on function public.vanish_seen_messages(uuid) from public, anon'), 'the sweep RPC must not be callable by anon'],
      [schema.includes('create table if not exists public.conversation_locks'), 'per-conversation lock rows must exist (the lock is OPTIONAL per chat)'],
      [schema.includes('create table if not exists public.chat_lock_settings'), 'the chat-lock passcode verifier must be server-stored'],
    ];
    for (const [ok, name] of checks) {
      results.push({ name: `17.1 ${name}`, passed: ok, duration: 0 });
    }
    void schemaStart;
  } catch (err: any) {
    results.push({ name: '17.1 schema inspection', passed: false, duration: Date.now() - schemaStart, error: err?.message });
  }

  try {
    const inbox = read('src', 'components', 'chat', 'InboxPanel.tsx');
    const menu = read('src', 'components', 'ui', 'ContextMenu.tsx');
    const app = read('src', 'components', 'layout', 'ChatApp.tsx');
    const checks: Array<[boolean, string]> = [
      [inbox.includes("onContextMenu={e => { e.preventDefault(); openMenuFor(chat, e.clientX, e.clientY); }}"), 'chat rows must open a context menu on RIGHT-CLICK (Instagram parity)'],
      [inbox.includes('onTouchStart'), 'mobile users must get the same menu via LONG-PRESS'],
      [inbox.includes("'Lock chat'") && inbox.includes("'Unlock chat'"), 'the menu must offer Lock chat / Unlock chat'],
      [inbox.includes("'Mute messages'"), 'the menu must offer Mute messages (Instagram parity)'],
      [inbox.includes("'Delete chat'"), 'the menu must offer Delete chat (Instagram parity)'],
      [menu.includes('createPortal'), 'the context menu must render in a portal at the pointer'],
      [inbox.includes('isChatProtected(chat.id)'), 'locked rows must show the lock state'],
      [app.includes('onRequestLockChat={(chat: Chat) => setLockSetupChat(chat)}'), 'the shell must open the lock setup from the menu'],
      [app.includes('LockChatSetupModal'), 'the shell must provide the lock-setup modal'],
      [app.includes('validateChatLockPassword'), 'the setup must reuse the Phase-4 passcode validation'],
    ];
    for (const [ok, name] of checks) {
      results.push({ name: `17.2 ${name}`, passed: ok, duration: 0 });
    }

    const convo = read('src', 'components', 'chat', 'ConversationPanel.tsx');
    const ctx = read('src', 'contexts', 'CryptoContext.tsx');
    const outbox = read('src', 'utils', 'outbox.ts');
    const checks3: Array<[boolean, string]> = [
      [convo.includes('toggleVanishMode'), 'vanish mode must have its own dedicated toggle'],
      [convo.includes('<Ghost'), 'the vanish toggle must be visually separate from the burn-on-read Flame'],
      [convo.includes('sendMessage(cmd, file, replyToId, burnNext, undefined, vanishMode)'), 'vanish must ride its own message flag, not burn_on_read'],
      [convo.includes("supabase.rpc('vanish_seen_messages', { p_chat_id: cid })"), 'leaving the chat must sweep seen vanishing messages'],
      [convo.includes('Message vanished'), 'vanished tombstones must read differently from unsent ones'],
      [convo.includes("Vanish mode on — messages vanish after they're seen and you leave"), 'the active banner must state the exact semantics'],
      [ctx.includes('vanishOverride?: boolean'), 'sendMessage must accept the vanish override'],
      [ctx.includes('vanish,') && ctx.includes('client_tag: clientTag,'), 'the idempotent insert payload must carry vanish'],
      [outbox.includes('vanish?: boolean;'), 'the durable outbox must preserve vanish across retries'],
    ];
    for (const [ok, name] of checks3) {
      results.push({ name: `17.3 ${name}`, passed: ok, duration: 0 });
    }

    const admin = read('src', 'components', 'admin', 'AdminPanel.tsx');
    const checks4: Array<[boolean, string]> = [
      [app.includes("p.startsWith('/admin')"), 'the admin panel must live at the /admin route — and nowhere else'],
      [admin.includes("supabase.rpc('is_admin')"), 'the panel must verify the role against the SERVER'],
      [app.includes("p === '/' || p.startsWith('/direct')"), 'the main rail must stay Instagram-user-facing (no admin button)'],
    ];
    for (const [ok, name] of checks4) {
      results.push({ name: `17.4 ${name}`, passed: ok, duration: 0 });
    }
  } catch (err: any) {
    results.push({ name: '12.x client inspection', passed: false, duration: 0, error: err?.message });
  }

  return results;
}
