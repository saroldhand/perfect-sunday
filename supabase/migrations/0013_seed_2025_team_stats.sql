-- Real 2025 final regular-season numbers for all 32 clubs.
--
-- Unlike the demo lines in 0005, these are NOT invented. Every value is
-- computed from the 272 completed 2025 regular-season game results published
-- by nflverse (github.com/nflverse/nfldata, data/games.csv): wins, losses and
-- ties from the scores, ppg and papg as points for / against divided by the
-- seventeen games each club played. Verified against three identities before
-- being written here — 544 team-games, league points for equal to league
-- points against, and league wins equal to league losses.
--
-- These are LAST season's numbers, and the card must say so. A club's record
-- shown flat against a Week 1 matchup reads as this year's form, which it is
-- not. `stats_season` is what makes that legible: the UI renders the season
-- the numbers belong to alongside them, so 2025 finals are labelled as 2025
-- rather than passed off as current. From Week 2 onward, sync-slate overwrites
-- these rows with in-progress numbers and bumps stats_season, and the same
-- label starts reading "2026 thru wk 2" without a code change.
--
-- nflverse abbreviates the Rams LA; this table uses LAR, so that one row is
-- remapped. Every other abbreviation matches.

alter table public.teams
  add column if not exists stats_season int;

comment on column public.teams.stats_season is
  'Season the wins/losses/ties/ppg/papg describe. Read with updated_through_week: (2025, 18) is a final, (2026, 3) is in progress. Null means no stats loaded.';

update public.teams t set
  wins = v.wins, losses = v.losses, ties = v.ties,
  ppg = v.ppg, papg = v.papg,
  stats_season = 2025, updated_through_week = 18
from (values
  ('ARI', 3, 14, 0, 20.9, 28.7),
  ('ATL', 8, 9, 0, 20.8, 23.6),
  ('BAL', 8, 9, 0, 24.9, 23.4),
  ('BUF', 12, 5, 0, 28.3, 21.5),
  ('CAR', 8, 9, 0, 18.3, 22.4),
  ('CHI', 11, 6, 0, 25.9, 24.4),
  ('CIN', 6, 11, 0, 24.4, 28.9),
  ('CLE', 5, 12, 0, 16.4, 22.3),
  ('DAL', 7, 9, 1, 27.7, 30.1),
  ('DEN', 14, 3, 0, 23.6, 18.3),
  ('DET', 9, 8, 0, 28.3, 24.3),
  ('GB', 9, 7, 1, 23.0, 21.2),
  ('HOU', 12, 5, 0, 23.8, 17.4),
  ('IND', 8, 9, 0, 27.4, 24.2),
  ('JAX', 13, 4, 0, 27.9, 19.8),
  ('KC', 6, 11, 0, 21.3, 19.3),
  ('LAC', 11, 6, 0, 21.6, 20.0),
  ('LAR', 12, 5, 0, 30.5, 20.4),
  ('LV', 3, 14, 0, 14.2, 25.4),
  ('MIA', 7, 10, 0, 20.4, 24.9),
  ('MIN', 9, 8, 0, 20.2, 19.6),
  ('NE', 14, 3, 0, 28.8, 18.8),
  ('NO', 6, 11, 0, 18.0, 22.5),
  ('NYG', 4, 13, 0, 22.4, 25.8),
  ('NYJ', 3, 14, 0, 17.6, 29.6),
  ('PHI', 11, 6, 0, 22.3, 19.1),
  ('PIT', 10, 7, 0, 23.4, 22.8),
  ('SEA', 14, 3, 0, 28.4, 17.2),
  ('SF', 12, 5, 0, 25.7, 21.8),
  ('TB', 8, 9, 0, 22.4, 24.2),
  ('TEN', 3, 14, 0, 16.7, 28.1),
  ('WAS', 5, 12, 0, 20.9, 26.5)
) as v (abbr, wins, losses, ties, ppg, papg)
where t.abbr = v.abbr;
