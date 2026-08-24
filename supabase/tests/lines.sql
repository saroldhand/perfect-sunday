-- Tests for private.apply_week_lines and private.next_week_needing_lines
-- (0016). Same shape as the other suites: one transaction ending in ROLLBACK,
-- on fixture weeks numbered 980-982, safe to run against the live project.
--
-- The rule worth the most here is that a locked week's lines cannot move. Every
-- entry in a locked week was graded against the numbers standing at lock, and a
-- feed that rewrites one changes what people were scored on after the fact —
-- silently, and in the feed's favour rather than anyone's.
--
-- Results as of 2026-08-24: 15 of 15 passing.

begin;
create temp table results (test text, expected text, actual text, pass boolean) on commit drop;
-- The function's return rows land here rather than in psql variables, matching
-- how scoring.sql records its assertions.
create temp table applied (label text, updated int, missing int, opened boolean) on commit drop;

insert into public.weeks (id, season, week_number, locks_at, status)
  overriding system value
values
  (980, 2099, 1, now() + interval '2 days', 'upcoming'),  -- the one to fill
  (981, 2099, 2, now() + interval '9 days', 'upcoming'),  -- later, also unfilled
  (982, 2099, 3, now() + interval '1 day',  'locked');    -- closed to the feed

insert into public.games (week_id, external_id, away_team, home_team, kickoff_at)
values
  (980, '2099-01-LV-KC',   'LV',  'KC',  now() + interval '3 days'),
  (980, '2099-01-CHI-GB',  'CHI', 'GB',  now() + interval '3 days'),
  (981, '2099-02-NYJ-BUF', 'NYJ', 'BUF', now() + interval '10 days');

-- The locked week already carries the numbers its entries were graded against.
insert into public.games (week_id, external_id, away_team, home_team, kickoff_at,
                          spread, total, over_odds, under_odds, line_source)
values (982, '2099-03-SF-SEA', 'SF', 'SEA', now() + interval '2 days',
        -3.5, 44.5, -110, -110, 'original-book');

-- ------------------------------------------------------- week selection ----

insert into results select 'next_week_needing_lines takes the earliest unfilled week','980',
  private.next_week_needing_lines()::text, private.next_week_needing_lines() = 980;

-- ------------------------------------------------------- partial slate ----

-- One of week 980's two games. A slate that is not complete must not open.
insert into applied select 'partial', * from private.apply_week_lines(980, 'test-book', '[
  {"externalId":"2099-01-LV-KC","spread":-3.5,"total":44.5,"overOdds":-110,"underOdds":-110}
]'::jsonb);

insert into results select 'partial fill updates one game','1',updated::text,updated=1 from applied where label='partial';
insert into results select 'partial fill reports the gap','1',missing::text,missing=1 from applied where label='partial';
insert into results select 'partial fill does NOT open the week','false',opened::text,not opened from applied where label='partial';
insert into results select 'week is still upcoming after a partial fill','upcoming',status::text,status='upcoming'
from public.weeks where id=980;

-- ------------------------------------------------------ complete slate ----

insert into applied select 'full', * from private.apply_week_lines(980, 'test-book', '[
  {"externalId":"2099-01-LV-KC","spread":-3.5,"total":44.5,"overOdds":-110,"underOdds":-110},
  {"externalId":"2099-01-CHI-GB","spread":2.5,"total":41.0,"overOdds":-105,"underOdds":-115}
]'::jsonb);

insert into results select 'complete fill leaves nothing missing','0',missing::text,missing=0 from applied where label='full';
insert into results select 'complete fill opens the week','true',opened::text,opened from applied where label='full';

-- over_odds and under_odds are adjacent ints of the same type, and the source
-- CSV lists under before over. Transposing them is invisible in a row count.
insert into results select 'odds land in the right columns','-105/-115',
  over_odds||'/'||under_odds, over_odds=-105 and under_odds=-115
from public.games where external_id='2099-01-CHI-GB';

insert into results select 'line_source is stored per game','test-book',line_source,line_source='test-book'
from public.games where external_id='2099-01-LV-KC';

-- --------------------------------------------------- the locked week ----

insert into applied select 'locked', * from private.apply_week_lines(982, 'new-book', '[
  {"externalId":"2099-03-SF-SEA","spread":99.5,"total":99.5,"overOdds":-999,"underOdds":-999}
]'::jsonb);

insert into results select 'a locked week accepts no updates','0',updated::text,updated=0 from applied where label='locked';

-- The assertion this file exists for.
insert into results select 'a locked week''s line is unchanged','-3.5/44.5',
  spread||'/'||total, spread=-3.5 and total=44.5
from public.games where external_id='2099-03-SF-SEA';

insert into results select 'a locked week''s line_source is unchanged','original-book',
  line_source, line_source='original-book'
from public.games where external_id='2099-03-SF-SEA';

-- ------------------------------------------------------- after opening ----

-- 980 is open and complete now, so the next week wanting lines is 981.
insert into results select 'a filled week drops out of the queue','981',
  private.next_week_needing_lines()::text, private.next_week_needing_lines() = 981;

-- ------------------------------------------------- the public wrappers ----

-- EXECUTE is granted to PUBLIC by default on a new function. If that default
-- survives, anyone holding the publishable key that ships in the build can
-- rewrite a week's lines. These two assert the revoke actually took.

insert into results select 'anon cannot execute the line writer','false',
  has_function_privilege('anon','public.sync_apply_week_lines(int,text,jsonb)','execute')::text,
  not has_function_privilege('anon','public.sync_apply_week_lines(int,text,jsonb)','execute');

insert into results select 'authenticated cannot execute the line writer','false',
  has_function_privilege('authenticated','public.sync_apply_week_lines(int,text,jsonb)','execute')::text,
  not has_function_privilege('authenticated','public.sync_apply_week_lines(int,text,jsonb)','execute');

insert into results select 'service_role can execute the line writer','true',
  has_function_privilege('service_role','public.sync_apply_week_lines(int,text,jsonb)','execute')::text,
  has_function_privilege('service_role','public.sync_apply_week_lines(int,text,jsonb)','execute');

select test, expected, actual, case when pass then 'PASS' else 'FAIL' end as verdict from results;
rollback;
