-- Tests for the schedulable wrappers in 0014. Same shape as scoring.sql: one
-- transaction ending in ROLLBACK, on fixture weeks numbered 990 and 991, so it
-- can be run against the live project without touching real data.
--
-- What these assert is week *selection*, which is the only thing the wrappers
-- add over lock_week and score_week. The grading rules themselves are already
-- covered by scoring.sql and are not re-tested here.
--
-- The two failures worth guarding against are opposite mistakes: a job that
-- sweeps up a week it should not have touched, and a job that keeps rewriting a
-- week it already finished. Both are invisible in a single run and obvious only
-- after the job has been on a timer for a week.
--
-- Results as of 2026-08-24: 9 of 9 passing.

begin;
create temp table results (test text, expected text, actual text, pass boolean) on commit drop;

-- 990 is due: open, and its lock time has passed. 991 is open but not yet due,
-- and is the control — a job that locks it has read the clock wrong.
insert into public.weeks (id, season, week_number, locks_at, status)
  overriding system value
values (990, 2099, 1, now() - interval '1 hour', 'open'),
       (991, 2099, 2, now() + interval '2 days', 'open');

insert into public.games (id, week_id, external_id, away_team, home_team, kickoff_at, spread, total, over_odds, under_odds, line_source)
values
  ('cccc0000-0000-4000-8000-000000000001', 990, 'J1', 'LV',  'KC', now(), -3.5, 44.5, -110, -110, 'test'),
  ('cccc0000-0000-4000-8000-000000000002', 991, 'J2', 'CHI', 'GB', now(), -3.5, 44.5, -110, -110, 'test');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('dddd0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cron@example.test','x',now(),now(),now());

insert into public.profiles (id, display_name)
values ('dddd0000-0000-4000-8000-000000000001','Cronny');

-- A complete set for the due week only.
insert into public.picks (user_id, game_id, total_pick, spread_pick)
values ('dddd0000-0000-4000-8000-000000000001','cccc0000-0000-4000-8000-000000000001','OVER','KC');

-- ---------------------------------------------------------------- lock ----

select count(*) as locked_now from private.lock_due_weeks() \gset

insert into results select 'lock_due_weeks locks the due week','locked',status::text,status='locked'
from public.weeks where id=990;

-- The control. An early lock is worse than a late one: it strands anyone who
-- was still picking against a posted deadline that had not arrived.
insert into results select 'lock_due_weeks leaves a week that is not due','open',status::text,status='open'
from public.weeks where id=991;

insert into results select 'lock created the entry','1',count(*)::text,count(*)=1
from public.entries where week_id=990;

-- Run again in the same minute, as an overlapping or retried tick would.
select count(*) as second_run from private.lock_due_weeks() \gset

insert into results select 'second lock run finds nothing due','0',:'second_run',:'second_run'='0';

insert into results select 'second lock run did not duplicate the entry','1',count(*)::text,count(*)=1
from public.entries where week_id=990;

-- --------------------------------------------------------------- score ----

-- Nothing is final yet. The job must still run cleanly and must not advance the
-- week — this is the state it sits in for most of Thursday through Sunday.
select count(*) from private.score_due_weeks();

insert into results select 'locked week with no finals stays locked','locked',status::text,status='locked'
from public.weeks where id=990;

select private.set_final_score(990,'J1',30,20);  -- 50 total beats 44.5; KC by 10 covers -3.5
select count(*) from private.score_due_weeks();

insert into results select 'score_due_weeks grades and flips to scored','scored',status::text,status='scored'
from public.weeks where id=990;

insert into results select 'entry graded','2/true',correct_count||'/'||is_perfect::text,
  correct_count=2 and is_perfect
from public.entries where week_id=990;

-- A scored week is a published result. The job must let go of it, or every tick
-- is free to move a number someone has already screenshotted.
select count(*) as after_scored from private.score_due_weeks() \gset

insert into results select 'a scored week drops out of the job','0',:'after_scored',:'after_scored'='0';

select test, expected, actual, case when pass then 'PASS' else 'FAIL' end as verdict from results;
rollback;
