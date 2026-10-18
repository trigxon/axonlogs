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

-- Instagram-parity message columns (idempotent): reactions, pins, edits,
-- unsent ("Unsend for everyone") + read-receipt state.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'messages' and column_name = 'reactions') then
    alter table public.messages add column reactions jsonb not null default '[]';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'messages' and column_name = 'pinned') then
    alter table public.messages add column pinned boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'messages' and column_name = 'edited') then
    alter table public.messages add column edited boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'messages' and column_name = 'unsent') then
    alter table public.messages add column unsent boolean not null default false;
  end if;
end $$;

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

-- Instagram-parity account columns (idempotent): display name, private
-- account, per-account blocklist, activity-status visibility.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'accounts' and column_name = 'display_name') then
    alter table public.accounts add column display_name text not null default '';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'accounts' and column_name = 'is_private') then
    alter table public.accounts add column is_private boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'accounts' and column_name = 'blocked_usernames') then
    alter table public.accounts add column blocked_usernames text[] not null default '{}';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'accounts' and column_name = 'show_activity') then
    alter table public.accounts add column show_activity boolean not null default true;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'accounts' and column_name = 'avatar_url') then
    alter table public.accounts add column avatar_url text not null default '';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1d. Follows — Instagram's social graph (follower → followed).
--     status = 'active' (following) or 'pending' (follow request to a
--     private account awaiting approval). Used for followers/following
--     lists, follow requests, and the DM message-requests gate.
-- ------------------------------------------------------------

create table if not exists public.follows (
  id         uuid primary key default gen_random_uuid(),
  follower   text not null,
  followed   text not null,
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  constraint follows_pair unique (follower, followed)
);

create index if not exists idx_follows_follower on public.follows (follower, status);
create index if not exists idx_follows_followed on public.follows (followed, status);

alter table public.follows enable row level security;

drop policy if exists "public read follows"   on public.follows;
drop policy if exists "public write follows"  on public.follows;
drop policy if exists "public update follows" on public.follows;
drop policy if exists "public delete follows" on public.follows;

create policy "public read follows"   on public.follows for select using (true);
create policy "public write follows"  on public.follows for insert with check (true);
create policy "public update follows" on public.follows for update using (true);
create policy "public delete follows" on public.follows for delete using (true);

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

-- ============================================================
--
-- SECTION 5 — IDENTITY & AUTHORIZATION V2 (security hardening)
--
-- The policies above (Sections 1-4) are the LEGACY baseline: they keep
-- older clients working but allow world read/write access. This section
-- replaces them with real, identity-scoped authorization built on
-- Supabase Auth (auth.uid()). Run order is safe: the client was
-- deployed FIRST and works with both baselines; once this section has
-- been run, the database is locked down.
--
-- Owner prerequisites (Supabase dashboard):
--   1. Authentication > Sign In / Providers > Email > turn OFF
--      "Confirm email" (accounts use synthetic emails like
--      <username>@users.axonlogs.app — there is no mailbox to click from).
--   2. Nothing else. New signups/login then run through Supabase Auth
--      and every row below becomes owned by its real user.
--
-- ============================================================

-- ------------------------------------------------------------
-- 5.1 accounts.auth_uid — links a profile row to its Supabase Auth
--     user. NULL for legacy (pre-migration) accounts; set automatically
--     at first Supabase-Auth signup/login (one-time adoption).
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'accounts' and column_name = 'auth_uid') then
    alter table public.accounts add column auth_uid uuid;
  end if;
end $$;

create unique index if not exists idx_accounts_auth_uid
  on public.accounts (auth_uid) where auth_uid is not null;

-- ------------------------------------------------------------
-- 5.2 Identity helper — the signed-in user's username, resolved from
--     the auth token. SECURITY DEFINER so policies can call it without
--     recursive RLS lookups on accounts.
-- ------------------------------------------------------------
create or replace function public.my_username() returns text
language sql stable security definer set search_path = public as
$$
  select username from public.accounts where auth_uid = auth.uid() limit 1;
$$;

grant execute on function public.my_username() to anon, authenticated;

-- NOTE: chat_participants is created HERE, before the language-sql
-- helpers below, because PostgreSQL validates a SQL function body at
-- CREATE time — a forward reference aborts a fresh database with
-- `42P01: relation "public.chat_participants" does not exist`.
-- Its RLS policies and backfill live in §5.4 below.
create table if not exists public.chat_participants (
  chat_id   uuid not null references public.chats(id) on delete cascade,
  username  text not null,
  joined_at timestamptz not null default now(),
  primary key (chat_id, username)
);

create index if not exists idx_chat_participants_username
  on public.chat_participants (username);

-- Membership helper — SECURITY DEFINER so policies can ask "am I in this
-- chat?" WITHOUT querying chat_participants from inside another RLS
-- policy. A policy that reads its own table recurses forever
-- ("infinite recursion detected in policy"), so every policy below goes
-- through this definer function instead of a direct subquery.
create or replace function public.is_chat_member(p_chat uuid, p_user text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_participants
    where chat_id = p_chat and username = lower(p_user)
  );
$$;

-- Group-size helper for the DM follow-gate (same recursion avoidance).
create or replace function public.chat_member_count(p_chat uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.chat_participants where chat_id = p_chat;
$$;

-- The server-enforced DM gate: I am a member AND (it's a group chat of
-- 3+ OR I actively follow the other participant).
create or replace function public.can_dm_chat(p_chat uuid, p_user text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.chat_participants me
      where me.chat_id = p_chat and me.username = lower(p_user)
    )
    and (
      public.chat_member_count(p_chat) > 2
      or exists (
        select 1
        from public.chat_participants other
        join public.follows f
          on f.follower = lower(p_user)
         and f.followed = other.username
         and f.status = 'active'
        where other.chat_id = p_chat
          and other.username <> lower(p_user)
      )
    );
$$;

grant execute on function public.is_chat_member(uuid, text) to authenticated;
grant execute on function public.chat_member_count(uuid) to authenticated;
grant execute on function public.can_dm_chat(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5.3 Safe profile reads — a view exposing ONLY public profile columns.
--     Direct SELECT on accounts is revoked (that is what made password
--     hashes world-readable). Reads go through public.profiles.
-- ------------------------------------------------------------
drop view if exists public.profiles;
create view public.profiles as
  select id, username, bio, avatar_gradient, display_name,
         is_private, show_activity, last_seen_at, created_at, avatar_url
  from public.accounts;

grant select on public.profiles to anon, authenticated;

-- Legacy login window: pre-migration accounts verify their password
-- against this view, which ONLY exposes rows not yet linked to a
-- Supabase Auth user. Once an account migrates, its hash becomes
-- unreadable. TECH DEBT: drop this view (and accounts.password_hash)
-- once every account has auth_uid — see "final lockdown" at the end.
drop view if exists public.legacy_login;
create view public.legacy_login as
  select id, username, password_hash from public.accounts where auth_uid is null;

grant select on public.legacy_login to anon, authenticated;

-- ------------------------------------------------------------
-- 5.4 Chat membership — messages/chats are visible only to their
--     members. Membership rows are written at chat creation and when
--     joining by code (proof = knowing the share code).
--     (The table + index are created in §5.2 — order is load-bearing
--     for the SQL-language helpers; only RLS lives here.)
-- ------------------------------------------------------------
alter table public.chat_participants enable row level security;

drop policy if exists "members read participants"  on public.chat_participants;
drop policy if exists "members insert participants" on public.chat_participants;

create policy "members read participants" on public.chat_participants
  for select using (
    username = public.my_username()
    -- definer helper: NEVER subquery chat_participants here (RLS recursion)
    or public.is_chat_member(chat_participants.chat_id, public.my_username())
  );

create policy "members insert participants" on public.chat_participants
  for insert to authenticated with check (true);

-- Backfill membership from dm_invites (DMs + group invites already sent)
insert into public.chat_participants (chat_id, username)
select distinct chat_id, from_username from public.dm_invites
on conflict do nothing;

insert into public.chat_participants (chat_id, username)
select distinct chat_id, to_username from public.dm_invites
on conflict do nothing;

-- Join-by-code RPC: knowing the share code is the proof of membership.
-- Returns the chat row, or NULL when the code matches nothing.
create or replace function public.join_chat_by_code(p_code text)
returns public.chats
language plpgsql security definer set search_path = public as
$$
declare
  c public.chats;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into c from public.chats where share_code = upper(trim(p_code));
  if not found then
    return null;
  end if;
  insert into public.chat_participants (chat_id, username)
  values (c.id, public.my_username())
  on conflict do nothing;
  return c;
end;
$$;

grant execute on function public.join_chat_by_code(text) to authenticated;

-- Blocklist helpers (the per-account blocklist column must stay private)
create or replace function public.my_blocklist() returns text[]
language sql stable security definer set search_path = public as
$$
  select coalesce(blocked_usernames, '{}') from public.accounts
  where auth_uid = auth.uid() limit 1;
$$;

create or replace function public.is_blocked_either_way(x text, y text)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.accounts a
    where (a.username = lower(x) and lower(y) = any(a.blocked_usernames))
       or (a.username = lower(y) and lower(x) = any(a.blocked_usernames))
  );
$$;

grant execute on function public.my_blocklist() to authenticated;
grant execute on function public.is_blocked_either_way(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5.5 Real authorization — replaces the legacy "public" policies.
--     Every policy below answers: WHO may do this, based on identity.
-- ------------------------------------------------------------

-- accounts: profiles are created by (and owned by) their auth user.
-- Password hashes are NOT readable by anyone (SELECT is revoked; the
-- legacy_login view above covers pre-migration logins only).
revoke select on public.accounts from anon, authenticated;

drop policy if exists "public read accounts"   on public.accounts;
drop policy if exists "public insert accounts" on public.accounts;
drop policy if exists "public update accounts" on public.accounts;

drop policy if exists "auth insert own account" on public.accounts;
create policy "auth insert own account" on public.accounts
  for insert to authenticated
  with check (auth_uid = auth.uid() or auth_uid is null);

-- UPDATE: your own row, plus a one-time ADOPTION window for unlinked
-- legacy rows (the client sets auth_uid after proving the legacy
-- password). TECH DEBT: after all accounts have migrated, tighten to
-- `using (auth_uid = auth.uid())` — see final lockdown below.
drop policy if exists "auth update own account" on public.accounts;
create policy "auth update own account" on public.accounts
  for update to authenticated
  using (auth_uid = auth.uid() or auth_uid is null)
  with check (auth_uid = auth.uid() or auth_uid is null);

-- follows: only I can follow as myself; only the followed account can
-- accept a request; either side can unfollow/decline/remove.
drop policy if exists "public write follows"  on public.follows;
drop policy if exists "public update follows" on public.follows;
drop policy if exists "public delete follows" on public.follows;

drop policy if exists "auth follow as self" on public.follows;
create policy "auth follow as self" on public.follows
  for insert to authenticated
  with check (follower = public.my_username());

drop policy if exists "followed accepts requests" on public.follows;
create policy "followed accepts requests" on public.follows
  for update to authenticated
  using (followed = public.my_username() or follower = public.my_username())
  with check (followed = public.my_username() or follower = public.my_username());

drop policy if exists "either side unfollows" on public.follows;
create policy "either side unfollows" on public.follows
  for delete to authenticated
  using (follower = public.my_username() or followed = public.my_username());

-- dm_invites: visible only to sender + recipient; sent only by the sender.
drop policy if exists "public read dm_invites"   on public.dm_invites;
drop policy if exists "public insert dm_invites" on public.dm_invites;
drop policy if exists "public delete dm_invites" on public.dm_invites;

drop policy if exists "invite parties only" on public.dm_invites;
create policy "invite parties only" on public.dm_invites
  for select
  using (to_username = public.my_username() or from_username = public.my_username());

drop policy if exists "sender inserts invites" on public.dm_invites;
create policy "sender inserts invites" on public.dm_invites
  for insert to authenticated
  with check (from_username = public.my_username());

drop policy if exists "recipient clears invites" on public.dm_invites;
create policy "recipient clears invites" on public.dm_invites
  for delete to authenticated
  using (to_username = public.my_username());

-- chats: readable only by members; creatable by signed-in users
-- (membership row follows immediately).
drop policy if exists "public read chats"   on public.chats;
drop policy if exists "public insert chats" on public.chats;
drop policy if exists "public update chats" on public.chats;
drop policy if exists "public delete chats" on public.chats;

drop policy if exists "members read chats" on public.chats;
create policy "members read chats" on public.chats
  for select using (
    public.is_chat_member(chats.id, public.my_username())
  );

drop policy if exists "auth create chats" on public.chats;
create policy "auth create chats" on public.chats
  for insert to authenticated with check (true);

drop policy if exists "members update chats" on public.chats;
create policy "members update chats" on public.chats
  for update to authenticated
  using (
    public.is_chat_member(chats.id, public.my_username())
  );

drop policy if exists "members delete chats" on public.chats;
create policy "members delete chats" on public.chats
  for delete to authenticated
  using (
    public.is_chat_member(chats.id, public.my_username())
  );

-- messages: members only. Sends are identity-checked AND, for 1:1 DMs,
-- SERVER-ENFORCED to follow the "only chat who you follow" rule.
drop policy if exists "public read messages"   on public.messages;
drop policy if exists "public insert messages" on public.messages;
drop policy if exists "public update messages" on public.messages;
drop policy if exists "public delete messages" on public.messages;

drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select using (
    public.is_chat_member(messages.chat_id, public.my_username())
  );

drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = public.my_username()
    and public.can_dm_chat(messages.chat_id, public.my_username())
  );

-- Updates (reactions, pins, read receipts, edits, unsend) stay
-- member-scoped. KNOWN LIMITATION (documented in AUDIT.md S6): RLS
-- cannot restrict UPDATE per column, so members can technically modify
-- each other's rows; the app only ever edits the sender's own rows.
-- Proper fix = separate message_reads/audit tables (roadmap Phase E).
drop policy if exists "members update messages" on public.messages;
create policy "members update messages" on public.messages
  for update to authenticated
  using (
    public.is_chat_member(messages.chat_id, public.my_username())
  );

drop policy if exists "members delete messages" on public.messages;
create policy "members delete messages" on public.messages
  for delete to authenticated
  using (
    public.is_chat_member(messages.chat_id, public.my_username())
  );

-- ------------------------------------------------------------
-- 5.6 FINAL LOCKDOWN (run manually once EVERY account has auth_uid):
--
-- drop view if exists public.legacy_login;
-- alter table public.accounts drop column if exists password_hash;
-- alter table public.accounts drop column if exists blocked_usernames;  -- optional: move to a table
--
--   and tighten adoption:
-- drop policy "auth update own account" on public.accounts;
-- create policy "auth update own account" on public.accounts
--   for update to authenticated
--   using (auth_uid = auth.uid())
--   with check (auth_uid = auth.uid());
-- ------------------------------------------------------------

-- ============================================================
--
-- SECTION 6 — STORIES, NOTIFICATIONS, CALLS, CLOSE FRIENDS
--             (full Instagram feature backend)
--
-- All idempotent. Visibility is enforced HERE, in Postgres:
--   • a client timer can never reveal an expired story (RLS filters
--     expires_at server-side);
--   • close-friends stories are only readable by the owner's list;
--   • blocked users are excluded everywhere.
--
-- ============================================================

-- ------------------------------------------------------------
-- 6.1 Close friends — per-owner list of members allowed to see
--     'close_friends' audience stories.
-- ------------------------------------------------------------
create table if not exists public.close_friends (
  owner  text not null,
  member text not null,
  created_at timestamptz not null default now(),
  primary key (owner, member)
);

alter table public.close_friends enable row level security;

drop policy if exists "close friends self manage" on public.close_friends;
create policy "close friends self manage" on public.close_friends
  for all to authenticated
  using (owner = public.my_username())
  with check (owner = public.my_username());

drop policy if exists "close friends readable" on public.close_friends;
create policy "close friends readable" on public.close_friends
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- 6.2 Relationship helpers (security definer — no recursive RLS)
-- ------------------------------------------------------------
create or replace function public.is_following(p_follower text, p_followed text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.follows
    where follower = lower(p_follower) and followed = lower(p_followed) and status = 'active'
  );
$$;

create or replace function public.is_close_friend(p_owner text, p_candidate text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.close_friends
    where owner = lower(p_owner) and member = lower(p_candidate)
  );
$$;

-- Can p_viewer see a story owned by p_owner with the given audience?
-- Rules (Instagram model):
--   owner always sees their own;
--   'close_friends' → owner's close-friends list only;
--   'followers'     → active followers, plus ANY signed-in user when the
--                     owner's account is public (profile visitors);
--   blocked (either direction) sees nothing.
create or replace function public.can_view_story(p_owner text, p_audience text, p_viewer text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    lower(p_owner) = lower(p_viewer)
    or (
      not public.is_blocked_either_way(p_owner, p_viewer)
      and (
        (p_audience = 'close_friends' and public.is_close_friend(p_owner, p_viewer))
        or
        (p_audience <> 'close_friends' and (
          public.is_following(p_viewer, p_owner)
          or exists (
            select 1 from public.accounts a
            where a.username = lower(p_owner) and a.is_private = false
          )
        ))
      )
    );
$$;

grant execute on function public.is_following(text, text) to authenticated;
grant execute on function public.is_close_friend(text, text) to authenticated;
grant execute on function public.can_view_story(text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6.3 Stories — 24h photo/video posts with audience control.
--     EXPIRY IS SERVER-ENFORCED: the SELECT policy hides anything
--     past expires_at regardless of what the client clock says.
-- ------------------------------------------------------------
create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  username    text not null,
  media_path  text not null,
  media_type  text not null default 'image' check (media_type in ('image', 'video')),
  caption     text not null default '',
  overlays    jsonb not null default '[]',
  audience    text not null default 'followers' check (audience in ('followers', 'close_friends')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_stories_username on public.stories (username, created_at desc);
create index if not exists idx_stories_expires on public.stories (expires_at);

alter table public.stories enable row level security;

drop policy if exists "story owners post" on public.stories;
create policy "story owners post" on public.stories
  for insert to authenticated
  with check (username = public.my_username());

-- NOTE: the SELECT policy ("story visibility") is created in §6.5b
-- below, AFTER highlight_stories exists. Its USING clause reads that
-- table and PostgreSQL validates the expression at CREATE POLICY
-- time — creating it here aborts a fresh database with
-- `42P01: relation "public.highlight_stories" does not exist`.

drop policy if exists "story owners manage" on public.stories;
create policy "story owners manage" on public.stories
  for delete to authenticated
  using (username = public.my_username());

drop policy if exists "story owners update" on public.stories;
create policy "story owners update" on public.stories
  for update to authenticated
  using (username = public.my_username())
  with check (username = public.my_username());

-- ------------------------------------------------------------
-- 6.4 Story views + quick reactions (one row per viewer per story).
--     The OWNER can see WHO watched; viewers only see their own row.
-- ------------------------------------------------------------
create table if not exists public.story_views (
  id        uuid primary key default gen_random_uuid(),
  story_id  uuid not null references public.stories(id) on delete cascade,
  viewer    text not null,
  reaction  text,
  viewed_at timestamptz not null default now(),
  constraint story_views_pair unique (story_id, viewer)
);

create index if not exists idx_story_views_story on public.story_views (story_id);

alter table public.story_views enable row level security;

drop policy if exists "story viewers insert" on public.story_views;
create policy "story viewers insert" on public.story_views
  for insert to authenticated
  with check (
    viewer = public.my_username()
    and exists (
      select 1 from public.stories s
      where s.id = story_id
        and public.can_view_story(s.username, s.audience, public.my_username())
    )
  );

drop policy if exists "story owner sees viewers" on public.story_views;
create policy "story owner sees viewers" on public.story_views
  for select to authenticated
  using (
    viewer = public.my_username()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.username = public.my_username()
    )
  );

drop policy if exists "story viewer reacts" on public.story_views;
create policy "story viewer reacts" on public.story_views
  for update to authenticated
  using (viewer = public.my_username())
  with check (viewer = public.my_username());

drop policy if exists "story viewer unviews" on public.story_views;
create policy "story viewer unviews" on public.story_views
  for delete to authenticated
  using (viewer = public.my_username());

-- ------------------------------------------------------------
-- 6.5 Highlights — archived stories pinned to the profile.
--     Visible under the same rules as the owner's profile.
-- ------------------------------------------------------------
create table if not exists public.highlights (
  id         uuid primary key default gen_random_uuid(),
  username   text not null,
  title      text not null default '',
  cover_path text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.highlights enable row level security;

drop policy if exists "highlight owners create" on public.highlights;
create policy "highlight owners create" on public.highlights
  for insert to authenticated
  with check (username = public.my_username());

drop policy if exists "highlight visibility" on public.highlights;
create policy "highlight visibility" on public.highlights
  for select to authenticated
  using (
    username = public.my_username()
    or (
      not public.is_blocked_either_way(username, public.my_username())
      and (
        public.is_following(public.my_username(), username)
        or exists (
          select 1 from public.accounts a
          where a.username = username and a.is_private = false
        )
      )
    )
  );

drop policy if exists "highlight owners manage" on public.highlights;
create policy "highlight owners manage" on public.highlights
  for delete to authenticated
  using (username = public.my_username());

drop policy if exists "highlight owners update" on public.highlights;
create policy "highlight owners update" on public.highlights
  for update to authenticated
  using (username = public.my_username())
  with check (username = public.my_username());

create table if not exists public.highlight_stories (
  highlight_id uuid not null references public.highlights(id) on delete cascade,
  story_id     uuid not null references public.stories(id) on delete cascade,
  position     int not null default 0,
  primary key (highlight_id, story_id)
);

alter table public.highlight_stories enable row level security;

drop policy if exists "highlight stories readable" on public.highlight_stories;
create policy "highlight stories readable" on public.highlight_stories
  for select to authenticated
  using (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_id
        and (
          h.username = public.my_username()
          or not public.is_blocked_either_way(h.username, public.my_username())
        )
    )
  );

drop policy if exists "highlight stories manage" on public.highlight_stories;
create policy "highlight stories manage" on public.highlight_stories
  for all to authenticated
  using (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_id and h.username = public.my_username()
    )
  )
  with check (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_id and h.username = public.my_username()
    )
  );

-- ------------------------------------------------------------
-- 6.5b Story SELECT policy — placed here, not in §6.3, because its
--     USING clause reads highlight_stories/highlights (created in
--     §6.5). CREATE POLICY validates the expression immediately,
--     so forward references abort a fresh database with 42P01.
--     Order in this file is load-bearing.
-- ------------------------------------------------------------
drop policy if exists "story visibility" on public.stories;
create policy "story visibility" on public.stories
  for select to authenticated
  using (
    public.can_view_story(username, audience, public.my_username())
    and (
      expires_at > now()
      -- expired stories stay readable inside highlights they were saved to
      or exists (
        select 1 from public.highlight_stories hs
        join public.highlights h on h.id = hs.highlight_id
        where hs.story_id = stories.id and h.username = public.my_username()
      )
    )
  );

-- ------------------------------------------------------------
-- 6.6 Notifications — one row per event, delivered to `username`.
--     Created by DB triggers (social graph) and by signed-in actors
--     for story events. RLS: you only ever see YOUR rows.
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  username   text not null,
  actor      text not null default '',
  type       text not null,
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (username, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications
  for select to authenticated
  using (username = public.my_username());

drop policy if exists "own notifications mark read" on public.notifications;
create policy "own notifications mark read" on public.notifications
  for update to authenticated
  using (username = public.my_username())
  with check (username = public.my_username());

drop policy if exists "own notifications delete" on public.notifications;
create policy "own notifications delete" on public.notifications
  for delete to authenticated
  using (username = public.my_username());

drop policy if exists "actors create notifications" on public.notifications;
create policy "actors create notifications" on public.notifications
  for insert to authenticated
  with check (actor = public.my_username());

-- Trigger: follow / follow request / follow accepted
create or replace function public.notify_on_follow()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.follower = NEW.followed then
    return NEW;
  end if;
  if TG_OP = 'INSERT' then
    insert into public.notifications (username, actor, type, payload)
    values (
      NEW.followed, NEW.follower,
      case when NEW.status = 'active' then 'follow' else 'follow_request' end,
      jsonb_build_object('status', NEW.status)
    );
  elsif TG_OP = 'UPDATE' and OLD.status = 'pending' and NEW.status = 'active' then
    insert into public.notifications (username, actor, type, payload)
    values (NEW.follower, NEW.followed, 'follow_accept', '{}'::jsonb);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_follows_notify on public.follows;
create trigger trg_follows_notify
  after insert or update of status on public.follows
  for each row execute function public.notify_on_follow();

-- Trigger: message request (DM invite → notification)
create or replace function public.notify_on_dm_invite()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.from_username = NEW.to_username then
    return NEW;
  end if;
  insert into public.notifications (username, actor, type, payload)
  values (NEW.to_username, NEW.from_username, 'message_request', jsonb_build_object('chat_id', NEW.chat_id));
  return NEW;
end;
$$;

drop trigger if exists trg_dm_invites_notify on public.dm_invites;
create trigger trg_dm_invites_notify
  after insert on public.dm_invites
  for each row execute function public.notify_on_dm_invite();

-- ------------------------------------------------------------
-- 6.7 Call history — every WebRTC call is recorded for the DM
--     thread and the missed-call notification. Signaling itself
--     stays on Supabase Realtime broadcast channels.
-- ------------------------------------------------------------
create table if not exists public.calls (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null,
  caller      text not null,
  callee      text not null default '',
  type        text not null default 'audio' check (type in ('audio', 'video')),
  status      text not null default 'ringing' check (status in ('ringing', 'answered', 'declined', 'missed', 'ended', 'cancelled')),
  started_at  timestamptz not null default now(),
  answered_at timestamptz,
  ended_at    timestamptz
);

create index if not exists idx_calls_chat on public.calls (chat_id, started_at desc);

alter table public.calls enable row level security;

drop policy if exists "call parties read" on public.calls;
create policy "call parties read" on public.calls
  for select to authenticated
  using (caller = public.my_username() or callee = public.my_username());

drop policy if exists "caller records call" on public.calls;
create policy "caller records call" on public.calls
  for insert to authenticated
  with check (caller = public.my_username());

drop policy if exists "call parties update" on public.calls;
create policy "call parties update" on public.calls
  for update to authenticated
  using (caller = public.my_username() or callee = public.my_username())
  with check (caller = public.my_username() or callee = public.my_username());

-- Trigger: incoming-call notification to the callee
create or replace function public.notify_on_call()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.caller = NEW.callee or NEW.callee = '' then
    return NEW;
  end if;
  insert into public.notifications (username, actor, type, payload)
  values (NEW.callee, NEW.caller, 'call', jsonb_build_object('call_id', NEW.id, 'call_type', NEW.type, 'chat_id', NEW.chat_id));
  return NEW;
end;
$$;

drop trigger if exists trg_calls_notify on public.calls;
create trigger trg_calls_notify
  after insert on public.calls
  for each row execute function public.notify_on_call();

-- ------------------------------------------------------------
-- 6.8 Storage — avatars (public) + story media (private, RLS-guarded)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('story_media', 'story_media', false)
on conflict (id) do nothing;

drop policy if exists "avatar files public read" on storage.objects;
create policy "avatar files public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar files owner write" on storage.objects;
create policy "avatar files owner write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.my_username()
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.my_username()
  );

-- Story media: path convention story_media/{username}/{audience}/{file}.
-- Direct reads (and signed-URL creation) run this RLS check.
drop policy if exists "story media visibility" on storage.objects;
create policy "story media visibility" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'story_media'
    and public.can_view_story(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2],
      public.my_username()
    )
  );

drop policy if exists "story media owner upload" on storage.objects;
create policy "story media owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'story_media'
    and (storage.foldername(name))[1] = public.my_username()
  );

drop policy if exists "story media owner manage" on storage.objects;
create policy "story media owner manage" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'story_media'
    and (storage.foldername(name))[1] = public.my_username()
  );

-- ------------------------------------------------------------
-- 6.9 Realtime — new tables join the publication so live updates
--     (notifications, story reactions, incoming calls) arrive
--     without polling. RLS applies to realtime delivery too.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['stories', 'story_views', 'notifications', 'calls', 'follows', 'highlights', 'close_friends']
  loop
    -- Guard on table existence too: a missing table must warn, never
    -- abort the whole schema run (real-world 42P01 regression guard).
    if to_regclass(format('public.%I', t)) is null then
      raise warning 'realtime: table public.% does not exist — skipped', t;
    elsif not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
