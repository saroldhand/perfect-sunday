-- Scoring tests for the total/spread format. Runs entirely inside a
-- transaction that ends in ROLLBACK, on a fixture week numbered 998, so it can
-- be run against the live project without touching real weeks, picks, or
-- entries.
--
-- Covers the rules that are easy to get wrong and expensive to get wrong: a
-- combined score landing exactly on the total counts for both sides, a spread
-- landing exactly on the number counts for both sides, an incomplete picker
-- never gets an entry, and re-running the job does not accumulate.
--
-- Results as of 2026-08-21: 11 of 11 passing.

begin;
create temp table results (test text, expected text, actual text, pass boolean) on commit drop;

insert into public.weeks (id, season, week_number, locks_at, status)
  overriding system value
values (998, 2099, 1, '2099-01-01T00:00:00Z', 'open');

insert into public.games (id, week_id, external_id, away_team, home_team, kickoff_at, spread, total, over_odds, under_odds, line_source)
values
  -- spread lands exactly (push); total does not
  ('bbbbbbbb-0000-4000-8000-000000000001', 998, 'G1', 'LV',  'KC',  '2099-01-01T18:00:00Z', -3.0, 44.5, -110, -110, 'test'),
  -- total lands exactly (push); spread does not
  ('bbbbbbbb-0000-4000-8000-000000000002', 998, 'G2', 'CHI', 'GB',  '2099-01-01T18:00:00Z', -7.0, 40.0, -110, -110, 'test'),
  -- ordinary on both layers
  ('bbbbbbbb-0000-4000-8000-000000000003', 998, 'G3', 'NYG', 'DAL', '2099-01-01T18:00:00Z', -3.5, 44.5, -110, -110, 'test');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('aaaa0001-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-a@example.test','x',now(),now(),now()),
  ('aaaa0002-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-b@example.test','x',now(),now(),now()),
  ('aaaa0003-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-c@example.test','x',now(),now(),now());

insert into public.profiles (id, display_name) values
  ('aaaa0001-0000-4000-8000-000000000001','TotalA'),
  ('aaaa0002-0000-4000-8000-000000000002','TotalB'),
  ('aaaa0003-0000-4000-8000-000000000003','TotalC');

-- A picks everything right. B misses four. C never finishes, and picks only G1.
insert into public.picks (user_id, game_id, total_pick, spread_pick) values
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','OVER','KC'),
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','OVER','CHI'),
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000003','OVER','DAL'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000001','UNDER','LV'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','UNDER','GB'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000003','UNDER','NYG'),
  ('aaaa0003-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001','OVER','KC');

insert into results select 'lock_week: entries only for complete sets','2',c::text,c=2 from private.lock_week(998) as c;
insert into results select 'incomplete picker gets no entry','0',count(*)::text,count(*)=0
from public.entries where week_id=998 and user_id='aaaa0003-0000-4000-8000-000000000003';

select private.set_final_score(998,'G1',24,21);  -- 45 pts, KC by exactly 3
select private.set_final_score(998,'G2',20,20);  -- 40 pts exactly, tie
select private.set_final_score(998,'G3',30,20);  -- 50 pts, DAL by 10
select * from private.score_week(998);

-- G2's combined score is exactly 40.0, the posted total. Both sides count.
-- Only A and B picked this game, hence 2.
insert into results select 'total lands exactly: correct for both sides','2 of 2',
  count(*) filter (where total_correct)||' of '||count(*), count(*)=2 and count(*) filter (where total_correct)=2
from public.picks where game_id='bbbbbbbb-0000-4000-8000-000000000002';

-- G1 totals 45 against a line of 44.5: over wins, under loses.
insert into results select 'total graded normally: OVER true / UNDER false','true / false',
  max(case when total_pick='OVER' then total_correct::text end)||' / '||max(case when total_pick='UNDER' then total_correct::text end),
  bool_and(case when total_pick='OVER' then total_correct else not total_correct end)
from public.picks where game_id='bbbbbbbb-0000-4000-8000-000000000001';

-- G1's spread is a push: KC -3.0 wins by exactly 3. All three sides count.
insert into results select 'spread lands exactly: correct for every side','3 of 3',
  count(*) filter (where spread_correct)||' of '||count(*), count(*)=3 and count(*) filter (where spread_correct)=3
from public.picks where game_id='bbbbbbbb-0000-4000-8000-000000000001';

insert into results select 'perfect entry','6/true/true',
  correct_count||'/'||is_perfect::text||'/'||is_alive::text, correct_count=6 and is_perfect and is_alive
from public.entries where week_id=998 and user_id='aaaa0001-0000-4000-8000-000000000001';

insert into results select 'busted entry','2/false/false',
  correct_count||'/'||is_perfect::text||'/'||is_alive::text, correct_count=2 and not is_perfect and not is_alive
from public.entries where week_id=998 and user_id='aaaa0002-0000-4000-8000-000000000002';

insert into results select 'week flips to scored','scored',status::text,status='scored'
from public.weeks where id=998;

-- The real job re-runs over already-final games every ten minutes.
select * from private.score_week(998);
select * from private.score_week(998);

insert into results select 'idempotent: A still 6','6',correct_count::text,correct_count=6
from public.entries where week_id=998 and user_id='aaaa0001-0000-4000-8000-000000000001';
insert into results select 'idempotent: B still 2','2',correct_count::text,correct_count=2
from public.entries where week_id=998 and user_id='aaaa0002-0000-4000-8000-000000000002';
insert into results select 'idempotent: still 2 entries','2',count(*)::text,count(*)=2 from public.entries where week_id=998;

select test, expected, actual, case when pass then 'PASS' else 'FAIL' end as verdict from results;
rollback;
