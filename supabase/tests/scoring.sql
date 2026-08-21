-- Scoring tests. Runs entirely inside a transaction that ends in ROLLBACK, on
-- a fixture week numbered 998, so it can be run against the live project
-- without touching real weeks, picks, or entries.
--
-- Covers the four rules that are easy to get wrong and expensive to get wrong:
-- a push counts correct for both sides, a tie counts correct for both
-- moneylines, an incomplete picker never gets an entry, and re-running the job
-- does not accumulate.
--
-- Results as of 2026-08-21: 11 of 11 passing.

begin;

create temp table results (test text, expected text, actual text, pass boolean) on commit drop;

insert into public.weeks (id, season, week_number, locks_at, status)
  overriding system value
values (998, 2099, 1, '2099-01-01T00:00:00Z', 'open');

insert into public.games (id, week_id, external_id, away_team, home_team, kickoff_at, spread, moneyline_home, moneyline_away, line_source)
values
  -- Whole-number spread that lands exactly: a push.
  ('bbbbbbbb-0000-4000-8000-000000000001', 998, 'G1', 'LV',  'KC',  '2099-01-01T18:00:00Z', -3.0, -150, 130, 'test'),
  -- Ends level: a tie.
  ('bbbbbbbb-0000-4000-8000-000000000002', 998, 'G2', 'CHI', 'GB',  '2099-01-01T18:00:00Z', -7.0, -300, 240, 'test'),
  -- Ordinary result.
  ('bbbbbbbb-0000-4000-8000-000000000003', 998, 'G3', 'NYG', 'DAL', '2099-01-01T18:00:00Z', -3.5, -180, 155, 'test');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('aaaa0001-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','score-a@example.test','x',now(),now(),now()),
  ('aaaa0002-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','score-b@example.test','x',now(),now(),now()),
  ('aaaa0003-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','score-c@example.test','x',now(),now(),now());

insert into public.profiles (id, display_name) values
  ('aaaa0001-0000-4000-8000-000000000001','ScoreA'),
  ('aaaa0002-0000-4000-8000-000000000002','ScoreB'),
  ('aaaa0003-0000-4000-8000-000000000003','ScoreC');

-- A picks everything right. B misses three. C never finishes, and picks only G1.
insert into public.picks (user_id, game_id, moneyline_pick, spread_pick) values
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','KC','KC'),
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','GB','CHI'),
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000003','DAL','DAL'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000001','LV','LV'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','CHI','GB'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000003','DAL','NYG'),
  ('aaaa0003-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001','KC','KC');

insert into results
select 'lock_week creates entries only for complete sets', '2', c::text, c = 2
from private.lock_week(998) as c;

insert into results
select 'incomplete picker gets no entry', '0', count(*)::text, count(*) = 0
from public.entries where week_id = 998 and user_id = 'aaaa0003-0000-4000-8000-000000000003';

select private.set_final_score(998, 'G1', 24, 21);
select private.set_final_score(998, 'G2', 20, 20);
select private.set_final_score(998, 'G3', 30, 20);
select * from private.score_week(998);

-- G1 is a push: KC -3.0 wins by exactly 3. All three spread picks on that game
-- grade correct regardless of side (A:KC, B:LV, C:KC).
insert into results
select 'push counts correct for every side picked', '3 of 3',
       count(*) filter (where spread_correct) || ' of ' || count(*),
       count(*) = 3 and count(*) filter (where spread_correct) = 3
from public.picks where game_id = 'bbbbbbbb-0000-4000-8000-000000000001';

-- G2 is a tie: both moneyline picks correct. Only A and B picked this game.
insert into results
select 'tie counts correct for every moneyline picked', '2 of 2',
       count(*) filter (where moneyline_correct) || ' of ' || count(*),
       count(*) = 2 and count(*) filter (where moneyline_correct) = 2
from public.picks where game_id = 'bbbbbbbb-0000-4000-8000-000000000002';

-- ...but a tie is still graded normally against the spread: GB -7 did not cover.
insert into results
select 'tie still grades the spread normally', 'CHI true / GB false',
       max(case when spread_pick = 'CHI' then spread_correct::text end) || ' / ' ||
       max(case when spread_pick = 'GB' then spread_correct::text end),
       bool_and(case when spread_pick = 'CHI' then spread_correct else not spread_correct end)
from public.picks where game_id = 'bbbbbbbb-0000-4000-8000-000000000002';

insert into results
select 'perfect entry: 6 correct, alive, perfect', '6/true/true',
       correct_count || '/' || is_perfect::text || '/' || is_alive::text,
       correct_count = 6 and is_perfect and is_alive
from public.entries where week_id = 998 and user_id = 'aaaa0001-0000-4000-8000-000000000001';

insert into results
select 'busted entry: 3 correct, not alive', '3/false/false',
       correct_count || '/' || is_perfect::text || '/' || is_alive::text,
       correct_count = 3 and not is_perfect and not is_alive
from public.entries where week_id = 998 and user_id = 'aaaa0002-0000-4000-8000-000000000002';

insert into results
select 'week flips to scored when all final', 'scored', status::text, status = 'scored'
from public.weeks where id = 998;

-- The real job re-runs over already-final games every ten minutes.
select * from private.score_week(998);
select * from private.score_week(998);

insert into results
select 'idempotent after 3 runs: A still 6', '6', correct_count::text, correct_count = 6
from public.entries where week_id = 998 and user_id = 'aaaa0001-0000-4000-8000-000000000001';

insert into results
select 'idempotent after 3 runs: B still 3', '3', correct_count::text, correct_count = 3
from public.entries where week_id = 998 and user_id = 'aaaa0002-0000-4000-8000-000000000002';

insert into results
select 'idempotent: still exactly 2 entries', '2', count(*)::text, count(*) = 2
from public.entries where week_id = 998;

select test, expected, actual, case when pass then 'PASS' else 'FAIL' end as verdict from results;

rollback;
