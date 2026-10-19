-- Supabase environment stubs for standalone PostgreSQL schema validation.
-- Recreates just enough of the hosted Supabase surface for schema.sql:
--   roles, auth schema (users + uid()), storage schema, realtime publication.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  aud                 text,
  role                text,
  email               text unique,
  phone               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  phone_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_sign_in_at     timestamptz
);

-- auth.uid() — reads the JWT claim from the connection GUC, like hosted Supabase.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id) on delete cascade,
  name text,
  owner uuid references auth.users(id),
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

-- logical WAL is required before any publication can exist
alter system set wal_level = logical;

-- the realtime publication the schema adds tables to
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
