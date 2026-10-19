#!/usr/bin/env node
// ------------------------------------------------------------
// Axon Logs — schema.sql validation harness (Task 12 rebuild).
//
// Real standalone PostgreSQL (embedded-postgres 18.4 binaries) with the
// hosted-Supabase surface stubbed (roles, auth.uid(), auth.users, storage,
// supabase_realtime). Proves:
//   1. FRESH database: supabase/schema.sql runs clean end-to-end
//      (no 42P01 statement-order regressions — see commit 1316e92).
//   2. IDEMPOTENCY: a second run over the same DB also succeeds.
//   3. Contract: expected tables / policies / RPCs exist afterwards.
//
// Usage: node scripts/validate-schema.mjs
// ------------------------------------------------------------
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// pg lives beside the embedded-postgres binaries in /tmp/pgtest.
const requireFromPg = createRequire('/tmp/pgtest/node_modules/pg/package.json');
const pg = requireFromPg('pg');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const PG_BIN = '/tmp/pgtest/node_modules/@embedded-postgres/linux-x64/native/bin';
const PGDATA = '/tmp/axon-schema-validate';
const PORT = Number(process.env.PG_PORT || 0); // 0 = pick a free port below
const SCHEMA = readFileSync(path.join(REPO, 'supabase/schema.sql'), 'utf8');
const STUBS = readFileSync(path.join(REPO, 'scripts/validate-schema-stubs.sql'), 'utf8');

const q = async (client, sql) => (await client.query(sql)).rows;

// node-pg wraps multi-statement strings in ONE implicit transaction, which
// breaks ALTER SYSTEM in the stubs. Run each statement separately ($$-aware,
// comment lines stripped so leading comments never swallow a statement).
async function runFile(client, content, label) {
  const stmts = [];
  let cur = '', inDollar = false;
  for (const line of content.split('\n')) {
    if (!inDollar && line.trimStart().startsWith('--')) continue; // comment line
    cur += line + '\n';
    const matches = line.match(/\$\$/g);
    if (matches) for (let i = 0; i < matches.length; i++) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(line)) {
      const s = cur.trim();
      if (s) stmts.push(s);
      cur = '';
    }
  }
  if (cur.trim()) stmts.push(cur.trim());
  for (const s of stmts) {
    try { await client.query(s); }
    catch (e) { throw new Error(`${label}: ${e.message}\n--- failing statement (first 200 chars) ---\n${s.slice(0, 200)}`); }
  }
  console.log(`   ${label}: ${stmts.length} statements executed`);
}

async function waitForPg(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const c = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
      await c.connect();
      await c.end();
      return;
    } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error('postgres did not become ready');
}

async function freePort() {
  if (PORT) return PORT;
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    srv.on('error', reject);
  });
}

async function main() {
  const port = await freePort();
  console.log(`== using port ${port} ==`);
  // 1 — fresh cluster (stop any orphan from a previous run first)
  try { execFileSync(`${PG_BIN}/pg_ctl`, ['stop', '-D', PGDATA, '-m', 'fast'], { stdio: 'ignore' }); } catch {}
  execFileSync('rm', ['-rf', PGDATA]);
  execFileSync(`${PG_BIN}/initdb`, ['-D', PGDATA, '-U', 'postgres', '--auth=trust'], { stdio: 'ignore' });
  execFileSync(`${PG_BIN}/pg_ctl`, ['start', '-D', PGDATA, '-w', '-t', '30', '-l', '/tmp/axon-schema-validate.log', '-o',
    `-p ${port} -c wal_level=logical -c listen_addresses=127.0.0.1`], { stdio: 'ignore' });
  const cleanup = () => { try { execFileSync(`${PG_BIN}/pg_ctl`, ['stop', '-D', PGDATA, '-m', 'fast'], { stdio: 'ignore' }); } catch {} };
  process.on('exit', cleanup);
  await waitForPg(port);
  const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
  await client.connect();

  // 2 — Supabase surface stubs
  console.log('== stubbing Supabase surface ==');
  await runFile(client, STUBS, 'stubs');

  // 3 — fresh run
  console.log('== run 1: fresh database ==');
  try { await runFile(client, SCHEMA, 'schema'); console.log('   PASS — schema.sql applied clean'); }
  catch (e) { console.error('   FAIL:', e.message); process.exit(1); }

  // 4 — idempotency run
  console.log('== run 2: idempotency ==');
  try { await runFile(client, SCHEMA, 'schema#2'); console.log('   PASS — second run clean'); }
  catch (e) { console.error('   FAIL:', e.message); process.exit(1); }

  // 5 — contract checks
  console.log('== contract checks ==');
  const checks = [
    ['tables', `select count(*)::int as n from pg_tables where schemaname='public'`],
    ['policies', `select count(*)::int as n from pg_policies where schemaname='public'`],
    ['chat_lock_settings', `select (to_regclass('public.chat_lock_settings') is not null)::text as n`],
    ['conversation_locks', `select (to_regclass('public.conversation_locks') is not null)::text as n`],
    ['verify_chat_lock', `select (to_regprocedure('public.verify_chat_lock(text)') is not null)::text as n`],
    ['realtime_tables', `select count(*)::int as n from pg_publication_tables where pubname='supabase_realtime'`],
    ['stories_gone', `select (to_regclass('public.stories') is null)::text as n`],
    ['account_keys', `select (to_regclass('public.account_keys') is not null)::text as n`],
    ['chat_keys', `select (to_regclass('public.chat_keys') is not null)::text as n`],
    ['keyring_read_policy', `select count(*)::int as n from pg_policies where schemaname='public' and tablename='account_keys' and policyname='keyring public keys readable'`],
    ['keyring_owner_write', `select count(*)::int as n from pg_policies where schemaname='public' and tablename='account_keys' and policyname='keyring owner writes' and coalesce(with_check, qual) like '%my_username%'`],
    ['chat_keys_own_reads', `select count(*)::int as n from pg_policies where schemaname='public' and tablename='chat_keys' and policyname='chat keys own reads' and qual like '%my_username%'`],
    ['chat_keys_member_insert', `select count(*)::int as n from pg_policies where schemaname='public' and tablename='chat_keys' and policyname='chat keys participant inserts' and with_check like '%is_chat_member%'`],
    ['attachments_upload_rls', `select count(*)::int as n from pg_policies where schemaname='storage' and tablename='objects' and policyname='attachments member upload' and with_check like '%is_chat_member%'`],
    ['attachments_read_rls', `select count(*)::int as n from pg_policies where schemaname='storage' and tablename='objects' and policyname='attachments member read' and qual like '%is_chat_member%'`],
  ];
  let fail = 0;
  const expectTrue = new Set(['chat_lock_settings', 'conversation_locks', 'verify_chat_lock', 'stories_gone', 'account_keys', 'chat_keys']);
  const expectPositive = new Set(['tables', 'policies', 'realtime_tables', 'keyring_read_policy', 'keyring_owner_write', 'chat_keys_own_reads', 'chat_keys_member_insert', 'attachments_upload_rls', 'attachments_read_rls']);
  for (const [name, sql] of checks) {
    const rows = await q(client, sql);
    const val = String(rows[0].n);
    const ok = expectTrue.has(name) ? val === 'true' : Number(val) > 0;
    console.log(`   ${name}=${val} ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) fail = 1;
  }
  await client.end();
  cleanup();
  if (fail) { console.error('== VALIDATION FAILED =='); process.exit(1); }
  console.log('== ALL VALIDATION CHECKS PASSED ==');
}

main().catch(e => { console.error(e); process.exit(1); });
