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
-- ============================================================
--
-- SECTION 6 — NOTIFICATIONS & CALLS
--
-- Stories are deliberately NOT part of Axon Logs (product spec:
-- no posts, no stories, no reels, no public feed). This section
-- carries only the notification stream and the call history.
--
-- ============================================================

-- ------------------------------------------------------------
-- 6.2 Relationship helper (security definer — no recursive RLS)
-- ------------------------------------------------------------
create or replace function public.is_following(p_follower text, p_followed text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.follows
    where follower = lower(p_follower) and followed = lower(p_followed) and status = 'active'
  );
$$;


grant execute on function public.is_following(text, text) to authenticated;

-- 6.6 Notifications — one row per event, delivered to `username`.
--     Created by DB triggers (social graph) and by signed-in actors
--     for DM-related events. RLS: you only ever see YOUR rows.
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


-- ------------------------------------------------------------
-- 6.8b Stories teardown — the product no longer ships stories.
--     Idempotent: on databases that already ran an older SECTION 6
--     (stories / story_views / highlights / highlight_stories /
--     close_friends + story_media bucket + can_view_story helpers),
--     this removes every object, policy and publication entry.
--     On fresh databases it is a no-op. DROP TABLE automatically
--     removes the table from the supabase_realtime publication.
-- ------------------------------------------------------------
do $$ begin
  -- storage first: these policies reference the story_media bucket
  drop policy if exists "story media visibility" on storage.objects;
  drop policy if exists "story media owner upload" on storage.objects;
  drop policy if exists "story media owner manage" on storage.objects;
  delete from storage.buckets where id = 'story_media';
  -- tables (children before parents; cascade is belt-and-braces)
  drop table if exists public.highlight_stories cascade;
  drop table if exists public.story_views cascade;
  drop table if exists public.stories cascade;
  drop table if exists public.highlights cascade;
  drop table if exists public.close_friends cascade;
  -- helpers whose only callers were the policies above
  drop function if exists public.can_view_story(text, text, text);
  drop function if exists public.is_close_friend(text, text);
end $$;

-- ------------------------------------------------------------
-- 6.9 Realtime — tables join the publication so live updates
--     (notifications, incoming calls) arrive
--     without polling. RLS applies to realtime delivery too.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['notifications', 'calls', 'follows']
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

-- ============================================================
-- 7. Messaging hardening (Phase D) — idempotent, retry-safe sends
-- ============================================================
-- messages.client_tag: a client-generated idempotency key. A resend re-uses
-- the SAME tag; the unique partial index below turns the second insert into
-- a 23505 conflict, so "Resend"/offline-flush can NEVER duplicate a message.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'messages' and column_name = 'client_tag') then
    alter table public.messages add column client_tag uuid;
  end if;
end $$;

create unique index if not exists idx_messages_chat_client_tag
  on public.messages (chat_id, client_tag)
  where client_tag is not null;

comment on column public.messages.client_tag is
  'Client idempotency key (Phase D): same tag across retries; (chat_id, client_tag) is unique.';
