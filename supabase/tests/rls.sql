-- Negative-case RLS tests for Perfect Sunday.
--
-- The publishable key ships in the static build, so RLS is the only thing
-- between a user and someone else's picks. Every policy therefore gets a test
-- that asserts the DENY case, not just the allow case.
--
-- Run against a database whose only data is the teams seed. Each test sets a
-- role and a JWT claim to impersonate a real client, and rolls back after.
-- Setup and teardown run as the owning role.

-- === setup ===================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test-a@example.test','x',now(),now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test-b@example.test','x',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111','RlsTestA'),
  ('22222222-2222-2222-2222-222222222222','RlsTestB')
on conflict (id) do nothing;

insert into public.weeks (id, season, week_number, locks_at, status)
  overriding system value
values (999, 2026, 1, '2026-09-10T20:00:00Z', 'open')
on conflict (id) do update set status = 'open';

insert into public.games (id, week_id, external_id, home_team, away_team, kickoff_at, spread, total, over_odds, under_odds, line_source)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 999, 'rls-test-game-1', 'CIN', 'BAL', '2026-09-13T17:00:00Z', -3.5, 44.5, -110, -110, 'demo'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 999, 'rls-test-game-2', 'KC',  'DEN', '2026-09-13T20:05:00Z', -7.5, 42.5, -110, -110, 'demo')
on conflict (id) do nothing;

-- === TEST 1: owner writes their own pick while the week is open. Expect PASS ==
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.picks (user_id, game_id, total_pick, spread_pick)
values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','OVER','CIN')
on conflict (user_id, game_id) do update set total_pick = excluded.total_pick;
commit;

-- === TEST 2: other user reads those picks while open. Expect 0 rows ==========
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select 'TEST 2 B reads A picks while open' as test, count(*) as rows_visible,
       case when count(*) = 0 then 'PASS' else 'FAIL - LEAK' end as verdict
from public.picks;
rollback;

-- === TEST 3: signed-out visitor reads picks while open. Expect 0 rows ========
begin;
set local role anon;
select 'TEST 3 anon reads picks while open' as test, count(*) as rows_visible,
       case when count(*) = 0 then 'PASS' else 'FAIL - LEAK' end as verdict
from public.picks;
rollback;

-- === TEST 4: owner reads their own picks while open. Expect 1 row ============
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select 'TEST 4 A reads own picks while open' as test, count(*) as rows_visible,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict
from public.picks;
rollback;

-- === TEST 5: user writes a pick under another user's id. Expect ERROR 42501 ==
-- Expected: new row violates row-level security policy for table "picks"
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.picks (user_id, game_id, total_pick, spread_pick)
values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','UNDER','BAL');
rollback;

-- === TEST 6: user marks their own pick correct. Expect ERROR 42501 ===========
-- RLS cannot express column rules; this is enforced by the column grant on
-- (total_pick, spread_pick).
-- Expected: permission denied for table picks
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.picks set total_correct = true, spread_correct = true
where user_id = '11111111-1111-1111-1111-111111111111';
rollback;

-- === TEST 7: owner edits their own pick while open. Expect PASS ==============
-- Guards against the TEST 6 column revoke breaking autosave.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.picks set total_pick = 'UNDER', spread_pick = 'BAL'
where user_id = '11111111-1111-1111-1111-111111111111'
returning 'TEST 7 A edits own pick while open' as test, total_pick, 'PASS' as verdict;
rollback;

-- === lock the week ===========================================================
update public.weeks set status = 'locked' where id = 999;

-- === TEST 8: other user reads those picks after lock. Expect 1 row ===========
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select 'TEST 8 B reads A picks AFTER lock' as test, count(*) as rows_visible,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict
from public.picks;
rollback;

-- === TEST 9: owner edits their pick after lock. Expect 0 rows updated ========
-- Counted explicitly rather than inferred: a blocked UPDATE returns no rows
-- from RETURNING, which is easy to mistake for a passing statement.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
with upd as (
  update public.picks set total_pick = 'UNDER'
  where user_id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select 'TEST 9 A edits own pick AFTER lock' as test, count(*) as rows_updated,
       case when count(*) = 0 then 'PASS' else 'FAIL - LEAK' end as verdict
from upd;
rollback;

-- === TEST 10: owner adds a new pick after lock. Expect ERROR 42501 ===========
-- Expected: new row violates row-level security policy for table "picks"
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.picks (user_id, game_id, total_pick, spread_pick)
values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-4000-8000-000000000002','OVER','KC');
rollback;

-- === TEST 11: anon reads a hidden profile column. Expect ERROR 42501 ========
-- The policy lets anon see profile rows; only the column grant stops it
-- reading when someone accepted the terms. This is the test for that grant.
-- Expected: permission denied for table profiles
begin;
set local role anon;
select terms_accepted_at from public.profiles limit 1;
rollback;

-- === TEST 12: anon reads the public profile columns. Expect 2 rows ==========
-- The mirror of test 11. Guards against a future tightening that silently
-- blanks every name on the public board.
begin;
set local role anon;
select 'TEST 12 anon reads public profile columns' as test, count(*) as rows_visible,
       case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict
from (
  select id, display_name from public.profiles
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222')
) p;
rollback;

-- === teardown ================================================================
delete from public.picks where user_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.weeks where id = 999;
delete from public.profiles where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
