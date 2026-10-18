/**
 * Phase D — messaging hardening: durable outbox for messages that failed to
 * reach the cloud (offline, RLS hiccup, network drop). Every queued entry
 * carries a stable `client_tag`; retries reuse the SAME tag and the unique
 * `(chat_id, client_tag)` index makes duplicate delivery impossible — the
 * second insert lands as 23505 and is treated as idempotent success.
 *
 * Pure, storage-injectable so the runtime tests can execute it in Node.
 */

export interface OutboxEntry {
  /** idempotency key — same tag on every retry */
  client_tag: string;
  /** the optimistic row id shown in the feed */
  id: string;
  chat_id: string;
  /** chat key (share_code) — needed to decrypt for display + re-encrypt context */
  share_code: string;
  /** already-encrypted insert payload (text / file_url stay ciphertext) */
  payload: {
    id: string;
    chat_id: string;
    sender_id: string;
    text: string;
    file_url: string | null;
    burn_on_read: boolean;
    reply_to_id: string | null;
    read_by: string[];
    created_at: string;
  };
  queued_at: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Safe in every runtime (Node tests have no localStorage). */
const defaultStorage = (): StorageLike | null => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* blocked storage */
  }
  return null;
};

export const OUTBOX_KEY = 'axon_outbox';

export function readOutbox(store: StorageLike | null = defaultStorage()): OutboxEntry[] {
  if (!store) return [];
  try {
    const raw = store.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeOutbox(entries: OutboxEntry[], store: StorageLike | null = defaultStorage()): void {
  if (!store) return;
  try {
    store.setItem(OUTBOX_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — outbox is best-effort by design */
  }
}

export function queueForRetry(entry: OutboxEntry, store: StorageLike | null = defaultStorage()): OutboxEntry[] {
  const next = readOutbox(store).filter(e => e.client_tag !== entry.client_tag);
  next.push(entry);
  writeOutbox(next, store);
  return next;
}

export function removeFromOutbox(clientTag: string, store: StorageLike | null = defaultStorage()): OutboxEntry[] {
  const next = readOutbox(store).filter(e => e.client_tag !== clientTag);
  writeOutbox(next, store);
  return next;
}

export function outboxForChat(chatId: string, store: StorageLike | null = defaultStorage()): OutboxEntry[] {
  return readOutbox(store).filter(e => e.chat_id === chatId);
}

/**
 * Classify a failed insert from a flush/retry attempt.
 * - 'duplicate'  → the row already exists (23505): the original send DID land;
 *                  treat as idempotent success and drop the entry.
 * - 'retryable'  → transient (network / RLS / offline): keep queued.
 * - 'permanent'  → malformed payload that can never succeed: drop + report.
 */
export function classifyFlushError(code?: string, message?: string): 'duplicate' | 'retryable' | 'permanent' {
  if (code === '23505') return 'duplicate';
  if (code === '23503' || code === '22P02' || code === '23514') return 'permanent';
  if (code === '42501') return 'retryable'; // RLS rejection — may succeed after re-auth
  if (!code && message && /fetch|network|offline|timeout/i.test(message)) return 'retryable';
  return 'retryable';
}
