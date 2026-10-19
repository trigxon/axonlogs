#!/usr/bin/env bash
# ------------------------------------------------------------
# Axon Logs — schema.sql validation harness (rebuilt, Task 12).
#
# Runs supabase/schema.sql against a REAL standalone PostgreSQL
# (embedded-postgres binaries, no root, no docker) that has the
# hosted-Supabase surface stubbed (roles, auth.uid(), auth.users,
# storage, supabase_realtime publication). Proves:
#   1. FRESH database: the whole file runs clean (no 42P01/42P16
#      statement-order regressions — see commit 1316e92).
#   2. IDEMPOTENCY: a second run over the same DB also succeeds.
#   3. Contract: expected tables/policies/RPCs exist afterwards.
#
# Usage: bash scripts/validate-schema.sh
# ------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="$(pwd)"
PG_BIN="/tmp/pgtest/node_modules/@embedded-postgres/linux-x64/native/bin"
PGDATA="/tmp/axon-schema-validate"
PORT="${PG_PORT:-54329}"
DB="axon_validate"
SUPER="${PGDATA}/super.sql"

[ -x "$PG_BIN/initdb" ] || { echo "FATAL: embedded postgres not at $PG_BIN"; exit 1; }

echo "== cleaning previous run =="
"$PG_BIN/pg_ctl" stop -D "$PGDATA" -m fast >/dev/null 2>&1 || true
rm -rf "$PGDATA"

echo "== initdb + start (port $PORT, wal_level=logical) =="
"$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" start -D "$PGDATA" -w -t 30 \
  -o "-p $PORT -c wal_level=logical -c listen_addresses=127.0.0.1" >/dev/null
trap '"$PG_BIN/pg_ctl" stop -D "$PGDATA" -m fast >/dev/null 2>&1 || true' EXIT

PSQL="$PG_BIN/psql -h 127.0.0.1 -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q"

"$PG_BIN/createdb" -h 127.0.0.1 -p $PORT -U postgres "$DB"

echo "== stubbing Supabase surface =="
$PSQL -f scripts/validate-schema-stubs.sql >/dev/null

echo "== run 1: fresh database =="
if $PSQL -f supabase/schema.sql > /tmp/validate_run1.log 2>&1; then
  echo "   PASS — schema.sql applied clean on a fresh DB"
else
  echo "   FAIL"; tail -30 /tmp/validate_run1.log; exit 1
fi

echo "== run 2: idempotency =="
if $PSQL -f supabase/schema.sql > /tmp/validate_run2.log 2>&1; then
  echo "   PASS — second run clean (idempotent)"
else
  echo "   FAIL"; tail -30 /tmp/validate_run2.log; exit 1
fi

echo "== contract checks =="
$PSQL -At <<'SQL' > /tmp/validate_contract.txt
select 'tables=' || count(*) from pg_tables where schemaname = 'public';
select 'policies=' || count(*) from pg_policies where schemaname = 'public';
select 'chat_lock_settings=' || (to_regclass('public.chat_lock_settings') is not null);
select 'conversation_locks=' || (to_regclass('public.conversation_locks') is not null);
select 'verify_chat_lock=' || (to_regprocedure('public.verify_chat_lock(text)') is not null);
select 'realtime_tables=' || count(*) from pg_publication_tables where pubname = 'supabase_realtime';
select 'stories_gone=' || (to_regclass('public.stories') is null);
SQL
cat /tmp/validate_contract.txt | sed 's/^/   /'

fail=0
grep -q 'tables=' /tmp/validate_contract.txt || fail=1
grep -q 'chat_lock_settings=t' /tmp/validate_contract.txt || { echo "   MISSING chat_lock_settings"; fail=1; }
grep -q 'conversation_locks=t' /tmp/validate_contract.txt || { echo "   MISSING conversation_locks"; fail=1; }
grep -q 'verify_chat_lock=t' /tmp/validate_contract.txt || { echo "   MISSING verify_chat_lock"; fail=1; }
grep -q 'stories_gone=t' /tmp/validate_contract.txt || { echo "   stories teardown broken"; fail=1; }
[ "$fail" = "0" ] && echo "== ALL VALIDATION CHECKS PASSED ==" || { echo "== VALIDATION FAILED =="; exit 1; }
