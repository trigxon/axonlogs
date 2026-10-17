-- ============================================================
-- Axon Logs - Supabase schema setup
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor).
-- It is idempotent: safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  share_code  text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  chat_id       uuid not null references public.chats(id) on delete cascade,
  sender_id     text not null,
  text          text not null default '',
  file_url      text,
  burn_on_read  boolean not null default true,
  reply_to_id   uuid,
  read_by       text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_messages_chat_id
  on public.messages (chat_id, created_at);

-- ------------------------------------------------------------
-- 1b. Accounts (Instagram-style username + password sign-up)
--     Passwords are PBKDF2-SHA256 hashed client-side before upload;
--     the plaintext never reaches the database.
-- ------------------------------------------------------------

create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  username        text not null unique,
  password_hash   text not null,
  bio             text not null default '',
  avatar_gradient text not null default '',
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index if not exists idx_accounts_username
  on public.accounts (lower(username));

-- Instagram-style username format enforced server-side:
-- 1-30 chars; letters, numbers, periods, underscores; no leading/trailing period.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_username_format'
      and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts
      add constraint accounts_username_format
      check (
        username ~ '^[a-z0-9._]{1,30}$'
        and username !~ '^[.]'
        and username !~ '[.]$'
      );
  end if;
end $$;

-- NOTE: no constraint on password_hash — the password policy is
-- intentionally unrestricted (client enforces username rules only).

alter table public.accounts enable row level security;

drop policy if exists "public read accounts"    on public.accounts;
drop policy if exists "public insert accounts"  on public.accounts;
drop policy if exists "public update accounts"  on public.accounts;

create policy "public read accounts"   on public.accounts for select using (true);
create policy "public insert accounts" on public.accounts for insert with check (true);
create policy "public update accounts" on public.accounts for update using (true);

-- ------------------------------------------------------------
-- 1c. DM invites — Instagram-style "Message @user" delivery.
--     A DM channel is created with a random share_code (which doubles
--     as the AES passphrase) and an invite row is addressed to the
--     recipient's username. Their client auto-joins on arrival.
-- ------------------------------------------------------------

create table if not exists public.dm_invites (
  id            uuid primary key default gen_random_uuid(),
  chat_id       uuid not null references public.chats(id) on delete cascade,
  share_code    text not null,
  from_username text not null,
  to_username   text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_dm_invites_to
  on public.dm_invites (to_username, created_at);

alter table public.dm_invites enable row level security;

drop policy if exists "public read dm_invites"    on public.dm_invites;
drop policy if exists "public insert dm_invites"  on public.dm_invites;
drop policy if exists "public delete dm_invites"  on public.dm_invites;

create policy "public read dm_invites"   on public.dm_invites for select using (true);
create policy "public insert dm_invites" on public.dm_invites for insert with check (true);
create policy "public delete dm_invites" on public.dm_invites for delete using (true);

-- ------------------------------------------------------------
-- 2. Row Level Security - the app relies on the anon key with
--    no user session, so allow public access to both tables.
-- ------------------------------------------------------------

alter table public.chats enable row level security;
alter table public.messages enable row level security;

drop policy if exists "public read chats"    on public.chats;
drop policy if exists "public insert chats"  on public.chats;
drop policy if exists "public update chats"  on public.chats;
drop policy if exists "public delete chats"  on public.chats;

create policy "public read chats"   on public.chats for select using (true);
create policy "public insert chats" on public.chats for insert with check (true);
create policy "public update chats" on public.chats for update using (true);
create policy "public delete chats" on public.chats for delete using (true);

drop policy if exists "public read messages"    on public.messages;
drop policy if exists "public insert messages"  on public.messages;
drop policy if exists "public update messages"  on public.messages;
drop policy if exists "public delete messages"  on public.messages;

create policy "public read messages"   on public.messages for select using (true);
create policy "public insert messages" on public.messages for insert with check (true);
create policy "public update messages" on public.messages for update using (true);
create policy "public delete messages" on public.messages for delete using (true);

-- ------------------------------------------------------------
-- 3. Realtime - broadcast message/chat changes to subscribers
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_invites'
  ) then
    alter publication supabase_realtime add table public.dm_invites;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Storage bucket for attachments (public URLs are used)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('chat_files', 'chat_files', true)
on conflict (id) do update set public = true;

drop policy if exists "public access chat_files" on storage.objects;

create policy "public access chat_files" on storage.objects
  for all
  using (bucket_id = 'chat_files')
  with check (bucket_id = 'chat_files');
