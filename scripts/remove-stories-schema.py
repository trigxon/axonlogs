#!/usr/bin/env python3
"""Remove the Stories feature (tables, helpers, storage, realtime) from
supabase/schema.sql per the revised master-prompt exclusions (no Stories),
and append an idempotent teardown for databases that already ran the old
SECTION 6. Line ranges verified against HEAD before editing."""
import re, sys

P = 'supabase/schema.sql'
src = open(P).read()
lines = src.split('\n')  # 0-indexed

def cut(a, b):
    """delete 1-indexed inclusive range after asserting its first line text"""
    return (a, b)

# sanity anchors (1-indexed line -> expected prefix)
anchors = {
    647: '-- 6.1 Close friends',
    671: '-- 6.2 Relationship helpers',
    723: '-- 6.3 Stories',
    906: '-- 6.5b Story SELECT policy',
    1098: '-- Story media: path convention',
    1129: '-- 6.9 Realtime',
}
for ln, pref in anchors.items():
    window = ' '.join(l.strip() for l in lines[ln-3:ln+2])
    if pref.split(' — ')[0].split(':')[0][:16] not in window:
        sys.exit(f'ANCHOR MISMATCH at line {ln}: expected {pref!r}, got ...{window[:100]!r}')

# Build new file:
out = lines[:634]                       # everything before line 635 (0-indexed 634)
# New SECTION 6 header (retitle: notifications + calls only)
out += [
  '-- ============================================================',
  '--',
  '-- SECTION 6 — NOTIFICATIONS & CALLS',
  '--',
  '-- Stories are deliberately NOT part of Axon Logs (product spec:',
  '-- no posts, no stories, no reels, no public feed). This section',
  '-- carries only the notification stream and the call history.',
  '--',
  '-- ============================================================',
  '',
  '-- ------------------------------------------------------------',
  '-- 6.2 Relationship helper (security definer — no recursive RLS)',
  '-- ------------------------------------------------------------',
]
out += lines[672:681]                   # is_following (orig lines 673-681)
# keep the grant for is_following only
out += ['', 'grant execute on function public.is_following(text, text) to authenticated;', '']
# §6.6 Notifications (orig 929-1015), §6.7 Calls (1016-1071)
out += lines[928:1071]
# §6.8 Storage avatars only (orig 1072-1097) + story teardown + realtime
out += lines[1071:1097]
out += ['',
'-- ------------------------------------------------------------',
'-- 6.8b Stories teardown — the product no longer ships stories.',
'--     Idempotent: on databases that already ran an older SECTION 6',
'--     (stories / story_views / highlights / highlight_stories /',
'--     close_friends + story_media bucket + can_view_story helpers),',
'--     this removes every object, policy and publication entry.',
'--     On fresh databases it is a no-op. DROP TABLE automatically',
'--     removes the table from the supabase_realtime publication.',
'-- ------------------------------------------------------------',
'do $$ begin',
'  -- storage first: these policies reference the story_media bucket',
'  drop policy if exists "story media visibility" on storage.objects;',
'  drop policy if exists "story media owner upload" on storage.objects;',
'  drop policy if exists "story media owner manage" on storage.objects;',
'  delete from storage.buckets where id = ''story_media'';',
'  -- tables (children before parents; cascade is belt-and-braces)',
'  drop table if exists public.highlight_stories cascade;',
'  drop table if exists public.story_views cascade;',
'  drop table if exists public.stories cascade;',
'  drop table if exists public.highlights cascade;',
'  drop table if exists public.close_friends cascade;',
'  -- helpers whose only callers were the policies above',
'  drop function if exists public.can_view_story(text, text, text);',
'  drop function if exists public.is_close_friend(text, text);',
'end $$;',
'']
# §6.9 realtime — drop story tables from the publication array
realtime = lines[1127:]
realtime_txt = '\n'.join(realtime)
realtime_txt = realtime_txt.replace(
  "array['stories', 'story_views', 'notifications', 'calls', 'follows', 'highlights', 'close_friends']",
  "array['notifications', 'calls', 'follows']")
realtime_txt = realtime_txt.replace(
  '-- 6.9 Realtime — new tables join the publication so live updates\n--     (notifications, story reactions, incoming calls) arrive',
  '-- 6.9 Realtime — tables join the publication so live updates\n--     (notifications, incoming calls) arrive')
out += realtime_txt.split('\n')

open(P, 'w').write('\n'.join(out))
print('schema surgery done, new line count:', len(out))
