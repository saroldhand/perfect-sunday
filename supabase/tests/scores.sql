-- Tests for private.apply_week_scores and private.next_week_needing_scores
-- (0017). Same shape as the other suites: one transaction ending in ROLLBACK,
-- on fixture weeks numbered 970-972, safe to run against the live project.
--
-- Two rules carry the weight here. A final is final — once a game's status is
-- 'final' its grades may be on someone's screen, and the feed must never move
-- them; corrections are the operator's deliberate call via set_final_score.
-- And grading rides in the same call as the write, which is what makes a card
-- flip within one client poll of a game ending — so the grade landing is
-- asserted here, not assumed.
--
-- Results as of 2026-08-27: 21 of 21 passing (verify on first run against the
-- live project once 0017 is applied).

begin;
create temp table results (test text, expected text, actual text, pass boolean) on commit drop;
create temp table applied (label text, updated int, finals int, remaining int, week_scored boolean) on commit drop;

insert into public.weeks (id, season, week_number, locks_at, status)
  overriding system value
values
  (970, 2098, 4, now() - interval '1 day',  'open'),    -- the week under test; locked below
  (971, 2098, 5, now() - interval '2 hours','locked'),  -- locked, but nothing has kicked off
  (972, 2098, 6, now() + interval '1 day',  'open');    -- open: closed to the scores feed

insert into public.games (id, week_id, external_id, away_team, home_team, kickoff_at,
                          spread, total, over_odds, under_odds, line_source)
values
  ('cccc0004-0000-4000-8000-000000000001', 970, '2098-04-LV-KC',
   'LV', 'KC', now() - interval '3 hours', -3.5, 44.5, -110, -110, 'test'),
  ('cccc0004-0000-4000-8000-000000000002', 970, '2098-04-CHI-GB',
   'CHI', 'GB', now() - interval '3 hours', 2.5, 41.0, -105, -115, 'test'),
  ('cccc0004-0000-4000-8000-000000000003', 971, '2098-05-NYJ-BUF',
   'NYJ', 'BUF', now() + interval '2 days', -9.5, 38.5, -110, -110, 'test'),
  ('cccc0004-0000-4000-8000-000000000004', 972, '2098-06-SF-SEA',
   'SF', 'SEA', now() - interval '1 hour', -3.5, 44.5, -110, -110, 'test');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('aaaa0004-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-scores@example.test','x',now(),now(),now());

insert into public.profiles (id, display_name) values
  ('aaaa0004-0000-4000-8000-000000000001','ScoresA');

-- A complete set on week 970: OVER + KC on G1, UNDER + GB on G2. With the
-- finals applied below, all four picks come out correct.
insert into public.picks (user_id, game_id, total_pick, spread_pick) values
  ('aaaa0004-0000-4000-8000-000000000001','cccc0004-0000-4000-8000-000000000001','OVER','KC'),
  ('aaaa0004-0000-4000-8000-000000000001','cccc0004-0000-4000-8000-000000000002','UNDER','GB');

-- Lock through the real path so the entry row exists the way it will in
-- production.
select private.lock_week(970);

-- ------------------------------------------------------- week selection ----

-- 971 is locked but no game has kicked off: a scores feed can know nothing
-- about it. 972 has a started game but is not locked. Only 970 qualifies.
insert into results select 'next_week_needing_scores takes the started locked week','970',
  private.next_week_needing_scores()::text, private.next_week_needing_scores() = 970;

-- --------------------------------------------------- an unlocked week ----

insert into applied select 'open-week', * from private.apply_week_scores(972, '[
  {"externalId":"2098-06-SF-SEA","homeScore":20,"awayScore":17,"status":"final"}
]'::jsonb);

insert into results select 'an open week accepts no scores','0',updated::text,updated=0 from applied where label='open-week';
insert into results select 'the open week''s game is untouched','scheduled/-',
  status||'/'||coalesce(home_score::text,'-'), status='scheduled' and home_score is null
from public.games where external_id='2098-06-SF-SEA';

-- ---------------------------------------------------- in-progress write ----

insert into applied select 'live', * from private.apply_week_scores(970, '[
  {"externalId":"2098-04-LV-KC","homeScore":14,"awayScore":10,"status":"in_progress"}
]'::jsonb);

insert into results select 'a live score lands','1',updated::text,updated=1 from applied where label='live';
insert into results select 'a live game reads in_progress with its score','in_progress/14/10',
  status||'/'||home_score||'/'||away_score, status='in_progress' and home_score=14 and away_score=10
from public.games where external_id='2098-04-LV-KC';

-- score_week grades only games standing final, so the live write must not
-- have graded anything.
insert into results select 'a live score does not grade the pick','null',
  coalesce(total_correct::text,'null'), total_correct is null
from public.picks where game_id='cccc0004-0000-4000-8000-000000000001';

-- ------------------------------------------------------ the first final ----

-- KC 30, LV 20: combined 50 beats 44.5 (OVER correct) and 30-3.5 beats 20
-- (KC covers). Both of this user's picks on the game are right.
insert into applied select 'final-1', * from private.apply_week_scores(970, '[
  {"externalId":"2098-04-LV-KC","homeScore":30,"awayScore":20,"status":"final"}
]'::jsonb);

insert into results select 'the final lands','1',updated::text,updated=1 from applied where label='final-1';
insert into results select 'one final, one game remaining','1/1',
  finals||'/'||remaining, finals=1 and remaining=1 from applied where label='final-1';
insert into results select 'a partial slate does not score the week','false',
  week_scored::text, not week_scored from applied where label='final-1';

-- The assertion sync-scores exists for: the grade is already there.
insert into results select 'the same call graded the pick','true/true',
  total_correct::text||'/'||spread_correct::text, total_correct and spread_correct
from public.picks where game_id='cccc0004-0000-4000-8000-000000000001';
insert into results select 'the entry moved in the same call','2',
  correct_count::text, correct_count=2
from public.entries where week_id=970;

-- -------------------------------------------------- a final is final ----

insert into applied select 'rewrite', * from private.apply_week_scores(970, '[
  {"externalId":"2098-04-LV-KC","homeScore":99,"awayScore":0,"status":"final"}
]'::jsonb);

insert into results select 'the feed cannot rewrite a final','0',updated::text,updated=0 from applied where label='rewrite';
insert into results select 'the final''s score is unchanged','30/20',
  home_score||'/'||away_score, home_score=30 and away_score=20
from public.games where external_id='2098-04-LV-KC';

-- ------------------------------------------------------- the last final ----

-- GB 20, CHI 17: combined 37 under 41.0 (UNDER correct) and 20+2.5 beats 17
-- (GB covers). The slate is complete; the week must score itself.
insert into applied select 'final-2', * from private.apply_week_scores(970, '[
  {"externalId":"2098-04-CHI-GB","homeScore":20,"awayScore":17,"status":"final"}
]'::jsonb);

insert into results select 'the last final scores the week','true',
  week_scored::text, week_scored from applied where label='final-2';
insert into results select 'the week reads scored','scored',status::text,status='scored'
from public.weeks where id=970;
insert into results select 'the entry is fully graded','4/true',
  correct_count||'/'||is_perfect::text, correct_count=4 and is_perfect
from public.entries where week_id=970;

-- 970 is done and 971 has not started: nothing needs syncing.
insert into results select 'a scored week drops out of the queue','null',
  coalesce(private.next_week_needing_scores()::text,'null'),
  private.next_week_needing_scores() is null;

-- A later sweep of the now-scored week is a quiet no-op, not an error — the
-- scheduled job will do exactly this within minutes of the flip.
insert into applied select 'after-scored', * from private.apply_week_scores(970, '[
  {"externalId":"2098-04-CHI-GB","homeScore":99,"awayScore":0,"status":"final"}
]'::jsonb);
insert into results select 'a scored week accepts no writes','0',updated::text,updated=0 from applied where label='after-scored';

-- ------------------------------------------------- the public wrappers ----

-- EXECUTE goes to PUBLIC by default on a new function. If that default
-- survives, the publishable key that ships in the build can write scores —
-- and through the in-call grading, score the week.

insert into results select 'anon cannot execute the score writer','false',
  has_function_privilege('anon','public.sync_apply_week_scores(int,jsonb)','execute')::text,
  not has_function_privilege('anon','public.sync_apply_week_scores(int,jsonb)','execute');

insert into results select 'authenticated cannot execute the score writer','false',
  has_function_privilege('authenticated','public.sync_apply_week_scores(int,jsonb)','execute')::text,
  not has_function_privilege('authenticated','public.sync_apply_week_scores(int,jsonb)','execute');

insert into results select 'service_role can execute the score writer','true',
  has_function_privilege('service_role','public.sync_apply_week_scores(int,jsonb)','execute')::text,
  has_function_privilege('service_role','public.sync_apply_week_scores(int,jsonb)','execute');

select test, expected, actual, case when pass then 'PASS' else 'FAIL' end as verdict from results;
rollback;
