-- DEMO DATA. The matchups are the real Week 18 slate of the 2025 season
-- (played 3-4 January 2026): sixteen divisional games, every club appearing
-- exactly once, which is how the NFL has built Week 18 since 2021.
--
-- Two things here are invented and must not be mistaken for real:
--
-- 1. The lines. There is no odds provider wired up yet, so every spread and
--    moneyline below is made up. line_source is therefore 'demo', NOT
--    'fanduel'. Grading an entry against a line the user never saw is the
--    worst failure this product has, so the provenance column stays honest.
--
-- 2. The dates. The real games are seven months in the past, and a slate whose
--    kickoffs have all passed renders every card disabled — there would be
--    nothing to demo. Kickoffs are shifted to the weekend of 12-13 September
--    2026, preserving the real Saturday/Sunday shape: two Saturday games, the
--    1:00 and 4:25 ET Sunday windows, and Ravens-Steelers on Sunday night.
--
-- Delete this migration once sync-slate pulls real weeks.

insert into public.weeks (season, week_number, locks_at, status)
values (2025, 18, '2026-09-10T20:00:00Z', 'open')  -- Thu 10 Sep 2026, 4:00 PM ET
on conflict (season, week_number) do update
  set locks_at = excluded.locks_at,
      status = excluded.status;

insert into public.games
  (week_id, external_id, away_team, home_team, kickoff_at, spread, moneyline_home, moneyline_away, line_source)
select
  w.id, v.external_id, v.away_team, v.home_team, v.kickoff_at::timestamptz,
  v.spread, v.moneyline_home, v.moneyline_away, 'demo'
from public.weeks w
cross join (values
  -- Saturday
  ('2025-18-CAR-TB',  'CAR', 'TB',  '2026-09-12T20:30:00Z', -3.5, -180,  152),
  ('2025-18-SEA-SF',  'SEA', 'SF',  '2026-09-13T00:00:00Z', -1.5, -125,  105),
  -- Sunday 1:00 PM ET
  ('2025-18-NO-ATL',  'NO',  'ATL', '2026-09-13T17:00:00Z', -4.5, -215,  178),
  ('2025-18-CLE-CIN', 'CLE', 'CIN', '2026-09-13T17:00:00Z', -6.5, -280,  230),
  ('2025-18-GB-MIN',  'GB',  'MIN', '2026-09-13T17:00:00Z',  2.5,  120, -142),
  ('2025-18-DAL-NYG', 'DAL', 'NYG', '2026-09-13T17:00:00Z',  3.5,  150, -180),
  ('2025-18-TEN-JAX', 'TEN', 'JAX', '2026-09-13T17:00:00Z', -7.5, -340,  270),
  ('2025-18-IND-HOU', 'IND', 'HOU', '2026-09-13T17:00:00Z', -2.5, -145,  122),
  ('2025-18-NYJ-BUF', 'NYJ', 'BUF', '2026-09-13T17:00:00Z', -9.5, -450,  350),
  ('2025-18-DET-CHI', 'DET', 'CHI', '2026-09-13T17:00:00Z',  5.5,  190, -230),
  ('2025-18-MIA-NE',  'MIA', 'NE',  '2026-09-13T17:00:00Z', -5.5, -245,  200),
  ('2025-18-WAS-PHI', 'WAS', 'PHI', '2026-09-13T17:00:00Z', -6.5, -290,  235),
  -- Sunday 4:25 PM ET
  ('2025-18-LAC-DEN', 'LAC', 'DEN', '2026-09-13T20:25:00Z', -1.5, -120,  100),
  ('2025-18-KC-LV',   'KC',  'LV',  '2026-09-13T20:25:00Z',  6.5,  230, -280),
  ('2025-18-ARI-LAR', 'ARI', 'LAR', '2026-09-13T20:25:00Z', -4.5, -210,  175),
  -- Sunday night
  ('2025-18-BAL-PIT', 'BAL', 'PIT', '2026-09-14T00:20:00Z',  2.5,  115, -138)
) as v (external_id, away_team, home_team, kickoff_at, spread, moneyline_home, moneyline_away)
where w.season = 2025 and w.week_number = 18
on conflict (week_id, external_id) do update
  set spread = excluded.spread,
      moneyline_home = excluded.moneyline_home,
      moneyline_away = excluded.moneyline_away,
      kickoff_at = excluded.kickoff_at,
      line_source = excluded.line_source;
