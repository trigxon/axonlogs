#!/usr/bin/env bash
# Standalone schema validation (Task 18): fresh-DB + idempotency against
# the theseus-rs PostgreSQL binaries already extracted under /tmp.
set -uo pipefail

PG_HOME="/tmp/postgresql-18.6.1-x86_64-unknown-linux-gnu"
SCHEMA="/home/z/my-project/axonlogs/supabase/schema.sql"
DATA="/tmp/pgdata-validate2"
PORT="54331"

export PATH="$PG_HOME/bin:$PATH"
export LC_ALL=C
fail() { echo "❌ $1"; exit 1; }

rm -rf "$DATA"
initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 || fail "initdb"
pg_ctl -D "$DATA" -l /tmp/pg-validate2.log -o "-p $PORT -c wal_level=logical -c listen_addresses=127.0.0.1" start >/dev/null 2>&1 || fail "start"
sleep 1
PSQL="psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
trap 'pg_ctl -D "$DATA" stop >/dev/null 2>&1' EXIT

$PSQL -d postgres <<'SQL' >/dev/null 2>&1 || fail "stubs"
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz, banned_until timestamptz, phone text);
create table if not exists auth.refresh_tokens (user_id uuid, token text);
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
create publication supabase_realtime;
SQL

run() {
  if $PSQL -d postgres -f "$SCHEMA" > /tmp/schema-run2.log 2>&1; then
    echo "✅ $1: SUCCESS"; return 0
  else
    echo "❌ $1: FAILED —"; grep -E "ERROR" /tmp/schema-run2.log | head -6; return 1
  fi
}
run "1. fresh DB" || exit 1
run "2. idempotent re-run" || exit 1

$PSQL -d postgres -At -c "select (select to_regclass('public.conversation_locks') is not null), (select to_regclass('public.chat_lock_settings') is not null), (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='vanish_seen_messages'), (select count(*) from information_schema.columns where table_name='messages' and column_name='vanish');" | { read -r A B C D; echo "locks=$A settings=$B vanish_rpc=$C vanish_col=$D"; }
echo DONE
