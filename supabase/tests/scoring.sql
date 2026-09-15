-- Scoring tests for the total/moneyline format. Runs entirely inside a
-- transaction that ends in ROLLBACK, on a fixture week numbered 998, so it can
-- be run against the live project without touching real weeks, picks, or
-- entries.
--
-- Covers the rules that are easy to get wrong and expensive to get wrong: a
-- combined score landing exactly on the total counts for both sides, a tied
-- game counts for both moneyline sides, a tie does NOT credit a moneyline
-- nobody picked, the posted price never decides a grade, an incomplete picker
-- never gets an entry, and re-running the job does not accumulate.
--
-- Results as of 2026-09-15: 13 of 13 passing. Verified against the live
-- project with 0019's DDL and functions applied inside the same transaction
-- and rolled back, so the suite was proven before the migration was committed
-- to production rather than after.

begin;
create temp table results (test text, expected text, actual text, pass boolean) on commit drop;

insert into public.weeks (id, season, week_number, locks_at, status)
  overriding system value
values (998, 2099, 1, '2099-01-01T00:00:00Z', 'open');

insert into public.games (id, week_id, external_id, away_team, home_team, kickoff_at, moneyline_home, moneyline_away, total, over_odds, under_odds, line_source)
values
  -- ordinary on both layers; home favourite wins
  ('bbbbbbbb-0000-4000-8000-000000000001', 998, 'G1', 'LV',  'KC',  '2099-01-01T18:00:00Z', -150, 130, 44.5, -110, -110, 'test'),
  -- tie: pushes on BOTH layers at once (total lands exactly, game drawn)
  ('bbbbbbbb-0000-4000-8000-000000000002', 998, 'G2', 'CHI', 'GB',  '2099-01-01T18:00:00Z', -200, 170, 40.0, -110, -110, 'test'),
  -- upset: the +155 away underdog wins outright
  ('bbbbbbbb-0000-4000-8000-000000000003', 998, 'G3', 'NYG', 'DAL', '2099-01-01T18:00:00Z', -180, 155, 44.5, -110, -110, 'test');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('aaaa0001-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-a@example.test','x',now(),now(),now()),
  ('aaaa0002-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-b@example.test','x',now(),now(),now()),
  ('aaaa0003-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-c@example.test','x',now(),now(),now());

insert into public.profiles (id, display_name) values
  ('aaaa0001-0000-4000-8000-000000000001','TotalA'),
  ('aaaa0002-0000-4000-8000-000000000002','TotalB'),
  ('aaaa0003-0000-4000-8000-000000000003','TotalC');

-- A picks everything right, including the G3 upset. B is wrong on both layers
-- of G1 and G3 and is carried only by G2's double push. C never finishes: one
-- complete game, then a total on G2 with no moneyline beside it — the shape
-- that catches the tie bug below.
insert into public.picks (user_id, game_id, total_pick, moneyline_pick) values
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','OVER','KC'),
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','OVER','CHI'),
  ('aaaa0001-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000003','OVER','NYG'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000001','UNDER','LV'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','UNDER','GB'),
  ('aaaa0002-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000003','UNDER','DAL'),
  ('aaaa0003-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001','OVER','KC'),
  ('aaaa0003-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000002','UNDER',null);

insert into results select 'lock_week: entries only for complete sets','2',c::text,c=2 from private.lock_week(998) as c;
insert into results select 'incomplete picker gets no entry','0',count(*)::text,count(*)=0
from public.entries where week_id=998 and user_id='aaaa0003-0000-4000-8000-000000000003';

select private.set_final_score(998,'G1',24,21);  -- 45 pts, KC (fav) wins
select private.set_final_score(998,'G2',20,20);  -- 40 pts exactly, drawn
select private.set_final_score(998,'G3',20,30);  -- 50 pts, NYG (+155 dog) wins
select * from private.score_week(998);

-- G2's combined score is exactly 40.0, the posted total. Both sides count.
-- All three users have a total on this game, hence 3.
insert into results select 'total lands exactly: correct for every side','3 of 3',
  count(*) filter (where total_correct)||' of '||count(*), count(*)=3 and count(*) filter (where total_correct)=3
from public.picks where game_id='bbbbbbbb-0000-4000-8000-000000000002';

-- G1 totals 45 against a line of 44.5: over wins, under loses.
insert into results select 'total graded normally: OVER true / UNDER false','true / false',
  max(case when total_pick='OVER' then total_correct::text end)||' / '||max(case when total_pick='UNDER' then total_correct::text end),
  bool_and(case when total_pick='OVER' then total_correct else not total_correct end)
from public.picks where game_id='bbbbbbbb-0000-4000-8000-000000000001';

-- G2 is drawn, so every moneyline side that was actually picked counts. Two of
-- the three rows on this game carry a pick; C's is null and is excluded here
-- and asserted separately below.
insert into results select 'tie: correct for both moneyline sides','2 of 2',
  count(*) filter (where moneyline_correct)||' of '||count(*), count(*)=2 and count(*) filter (where moneyline_correct)=2
from public.picks
where game_id='bbbbbbbb-0000-4000-8000-000000000002' and moneyline_pick is not null;

-- THE REGRESSION TEST. 0006 graded the moneyline with the tie arm ahead of the
-- null guard, so a drawn game set moneyline_correct = true on a row where
-- moneyline_pick was null — crediting a pick nobody made, and on a complete
-- slate that is the difference between a busted entry and a perfect one. It
-- never bit, because ties are rare and 0007 dropped the layer first. 0019
-- orders the guard first; this is what holds it there.
insert into results select 'tie does NOT credit an unmade moneyline pick','<null>',
  coalesce(moneyline_correct::text,'<null>'), moneyline_correct is null
from public.picks
where game_id='bbbbbbbb-0000-4000-8000-000000000002'
  and user_id='aaaa0003-0000-4000-8000-000000000003';

-- G3 is the upset: the away side priced at +155 wins outright. The grade
-- follows the score, never the price — a favourite losing is a wrong pick like
-- any other, and scoring does not read moneyline_home or moneyline_away at all.
insert into results select 'moneyline follows the score, not the price','true / false',
  max(case when moneyline_pick='NYG' then moneyline_correct::text end)||' / '||max(case when moneyline_pick='DAL' then moneyline_correct::text end),
  bool_and(case when moneyline_pick='NYG' then moneyline_correct else not moneyline_correct end)
from public.picks where game_id='bbbbbbbb-0000-4000-8000-000000000003';

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
