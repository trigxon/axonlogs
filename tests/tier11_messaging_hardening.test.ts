import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

/**
 * Tier 11: Phase D messaging hardening — keyset-paginated history,
 * idempotent (retry-safe) sends, durable offline outbox, delivery states.
 * Structural + runtime contracts, same style as tiers 7-10.
 */
export async function runTier11Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const read = (...p: string[]): string => fs.readFileSync(path.join(projectRoot, ...p), 'utf-8');

  const push = (name: string, passed: boolean, error?: string) =>
    results.push({ name, tier: 11, passed, error, durationMs: 0 });

  const check = (name: string, assertions: [boolean | string, string][]) => {
    try {
      const failures: string[] = [];
      for (const [cond, label] of assertions) {
        const ok = typeof cond === 'string' ? cond.length > 0 : cond;
        if (!ok) failures.push(label);
      }
      if (failures.length > 0) push(name, false, `Failed: ${failures.join('; ')}`);
      else push(name, true);
    } catch (err: any) {
      push(name, false, String(err?.message || err));
    }
  };

  /* ---------------- 11.1 schema: idempotency key ---------------- */

  const schema = read('supabase', 'schema.sql');
  check('Tier 11.1: messages.client_tag idempotency column + unique index (schema v2)', [
    [schema.includes('add column client_tag uuid'), 'schema.sql must add messages.client_tag uuid (idempotency key)'],
    [schema.includes('idx_messages_chat_client_tag'), 'schema.sql must create idx_messages_chat_client_tag'],
    [/create unique index if not exists idx_messages_chat_client_tag[\s\S]*?on public\.messages \(chat_id, client_tag\)/.test(schema), 'unique index must cover (chat_id, client_tag)'],
    [schema.includes('where client_tag is not null'), 'the unique index must be partial (client_tag is not null) so legacy rows are unaffected'],
  ]);

  /* ---------------- 11.2 context: pagination + idempotent sends ---------------- */

  const ctx = read('src', 'contexts', 'CryptoContext.tsx');
  check('Tier 11.2: message history is keyset-paginated (no unbounded full scan)', [
    [ctx.includes(".order('created_at', { ascending: false })") && ctx.includes('.limit(MESSAGE_PAGE_SIZE)'), 'fetchMessages must load only the newest page (descending + LIMIT)'],
    [ctx.includes(".lt('created_at', oldestCursorRef.current)"), 'loadOlderMessages must keyset-paginate with a created_at cursor (never OFFSET)'],
    [ctx.includes('oldestCursorRef.current = null;'), 'cursor must reset when the active chat changes'],
    [ctx.includes('setHasMoreMessages(data.length === MESSAGE_PAGE_SIZE)'), 'hasMore must be derived from full-page detection'],
    [ctx.includes('hasMoreMessages, messagesReloadKey, bumpMessagesReload, scrubConversation, loadingOlder, loadOlderMessages,') , 'pagination state must be exported through the context'],
  ]);

  check('Tier 11.3: sends are idempotent — client_tag on insert, pending→sent lifecycle', [
    [ctx.includes('const clientTag = crypto.randomUUID();'), 'sendMessage must generate a stable client_tag'],
    [/status: 'pending'[\s\S]{0,400}?client_tag: clientTag/.test(ctx) || (ctx.includes("status: 'pending'") && ctx.includes('client_tag: clientTag')), 'optimistic row must render PENDING before the network hop and carry the tag'],
    [ctx.includes('client_tag: clientTag,\n        };') || ctx.includes('client_tag: clientTag,'), 'the insert payload must include client_tag'],
    [ctx.includes("status: 'sent' } : m)") && ctx.includes("status: 'failed' } : m)"), 'server ack must flip pending→sent; failure must flip pending→failed'],
  ]);

  check('Tier 11.4: retry is REAL and duplicate-proof (no fake system-log resend)', [
    [!ctx.includes('addSystemMessage(`⟳ Resent:'), 'the old fake "⟳ Resent" system-log resend must be gone'],
    [ctx.includes('const resendMessage = useCallback(async (msgId: string)'), 'resendMessage must be an async real retry'],
    [ctx.includes('const clientTag = msg.client_tag || crypto.randomUUID();'), 'retry must REUSE the original client_tag'],
    [ctx.includes("classifyFlushError"), 'retry must classify 23505 as idempotent success (duplicate dedupe)'],
  ]);

  /* ---------------- 11.5 outbox: durable offline recovery ---------------- */

  const outboxUtil = read('src', 'utils', 'outbox.ts');
  check('Tier 11.5: durable outbox module — queue, dedupe by client_tag, flush classification', [
    [outboxUtil.includes('export interface OutboxEntry'), 'outbox.ts must define OutboxEntry'],
    [outboxUtil.includes("OUTBOX_KEY = 'axon_outbox'"), 'outbox must persist under axon_outbox'],
    [outboxUtil.includes('readOutbox(store).filter(e => e.client_tag !== entry.client_tag)'), 'queueForRetry must replace any prior entry with the same client_tag (no queue duplication)'],
    [outboxUtil.includes("if (code === '23505') return 'duplicate';"), '23505 must classify as duplicate (already delivered)'],
    [outboxUtil.includes("return 'retryable';"), 'unknown failures must remain retryable (never drop payloads)'],
    [outboxUtil.includes('typeof localStorage !== \'undefined\''), 'storage access must be guarded (Node test runtime has no localStorage)'],
  ]);

  check('Tier 11.6: context wires the outbox — queue on failure, flush on reconnect, restore on reload', [
    [ctx.includes('queueForRetry({'), 'failed sends must be queued for retry'],
    [ctx.includes('const flushOutbox = useCallback(async () =>'), 'a flush routine must exist'],
    [ctx.includes("window.addEventListener('online', onOnline)"), 'flush must trigger on connectivity restore'],
    [ctx.includes('outboxForChat(activeChat.id)'), 'page load must re-attach queued payloads for the active chat (offline recovery)'],
    [ctx.includes("flushedIds.has(m.id) ? { ...m, status: 'sent' }"), 'flushed rows must flip to sent in the live feed'],
    [ctx.includes('const insertMessageSafe = useCallback'), 'inserts must go through the safe wrapper'],
    [ctx.includes("code === 'PGRST204' || code === '42703'"), 'legacy-schema sends must degrade gracefully (retry insert without client_tag)'],
  ]);

  /* ---------------- 11.7 UI: load-earlier + tap-to-retry ---------------- */

  const panel = read('src', 'components', 'chat', 'ConversationPanel.tsx');
  check('Tier 11.7: conversation UI — load-earlier control + delivery status affordances', [
    [panel.includes('Load earlier messages'), 'feed must offer an explicit load-earlier control'],
    [panel.includes('el2.scrollHeight - before.h + before.t'), 'prepend must compensate scroll height so the viewport stays anchored'],
    [panel.includes('msg.status === \'failed\''), 'failed own messages must render a status marker'],
    [panel.includes('onClick={() => resendMessage(msg.id)}'), 'failed messages must expose a real tap-to-retry action'],
    [panel.includes("msg.status === 'pending' ? 'Sending…'"), 'pending messages must show an in-flight indicator'],
  ]);

  /* ---------------- 11.8 runtime: outbox behavior in Node ---------------- */

  try {
    const mod: any = await import('../src/utils/outbox.ts');
    const { readOutbox, writeOutbox, queueForRetry, removeFromOutbox, outboxForChat, classifyFlushError, OUTBOX_KEY } = mod;

    // in-memory storage stand-in
    const backing = new Map<string, string>();
    const store = {
      getItem: (k: string) => (backing.has(k) ? (backing.get(k) as string) : null),
      setItem: (k: string, v: string) => { backing.set(k, v); },
    };

    const entry = (tag: string, chatId = 'chat-1') => ({
      client_tag: tag,
      id: `id-${tag}`,
      chat_id: chatId,
      share_code: 'KEY',
      payload: {
        id: `id-${tag}`, chat_id: chatId, sender_id: 'dev-1', text: 'CIPHER',
        file_url: null, burn_on_read: false, reply_to_id: null, read_by: [],
        created_at: '2026-01-01T00:00:00Z',
      },
      queued_at: '2026-01-01T00:00:00Z',
    });

    backing.clear();
    const runtime: [boolean, string][] = [];

    // empty store → empty outbox
    runtime.push([readOutbox(store).length === 0, 'fresh store must read as empty outbox']);

    // queue two entries, retry the first twice → still exactly 2 entries (dedupe by tag)
    queueForRetry(entry('t1'), store);
    queueForRetry(entry('t2'), store);
    queueForRetry(entry('t1'), store);
    runtime.push([readOutbox(store).length === 2, 're-queuing the same client_tag must not duplicate the queue entry']);

    // chat scoping
    queueForRetry(entry('t3', 'chat-2'), store);
    runtime.push([outboxForChat('chat-1', store).length === 2 && outboxForChat('chat-2', store).length === 1, 'outboxForChat must scope by chat_id']);

    // removal
    removeFromOutbox('t1', store);
    runtime.push([readOutbox(store).every((e: any) => e.client_tag !== 't1'), 'removeFromOutbox must drop the flushed tag']);

    // classification
    runtime.push([classifyFlushError('23505') === 'duplicate', '23505 → duplicate (idempotent success)']);
    runtime.push([classifyFlushError('42501') === 'retryable', 'RLS rejection → retryable']);
    runtime.push([classifyFlushError(undefined, 'TypeError: fetch failed') === 'retryable', 'network error → retryable']);
    runtime.push([classifyFlushError('23503') === 'permanent', 'FK violation → permanent (drop, never spam-retry)']);

    // raw round-trip through real-ish storage format
    writeOutbox([entry('t9')], store);
    runtime.push([JSON.parse(backing.get(OUTBOX_KEY) as string)[0].client_tag === 't9', 'writeOutbox must persist under the canonical key']);

    const failures = runtime.filter(([ok]) => !ok).map(([, label]) => label);
    if (failures.length) push('Tier 11.8: outbox runtime behavior (executed, not assumed)', false, `Failed: ${failures.join('; ')}`);
    else push('Tier 11.8: outbox runtime behavior (executed, not assumed)', true);
  } catch (err: any) {
    push('Tier 11.8: outbox runtime behavior (executed, not assumed)', false, String(err?.message || err));
  }

  return results;
}
