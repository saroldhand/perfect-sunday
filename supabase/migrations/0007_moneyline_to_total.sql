-- Replaces the moneyline layer with an over/under (total) layer. Each game is
-- still two picks: the total, and the spread.
--
-- This reverses the format decision in SPEC.md §2. The consequence, recorded
-- here so it is not rediscovered later: at the spec's own assumed hit rates a
-- perfect week moves from roughly 1 in 20 million (moneyline + spread) to
-- roughly 1 in 665 million (total + spread).
--
-- A total pick is 'OVER' or 'UNDER', not a team, so the foreign key to teams
-- is dropped and replaced with a value check.

alter table public.games
  add column total numeric(4, 1),
  add column over_odds int,
  add column under_odds int;

alter table public.games
  drop column moneyline_home,
  drop column moneyline_away;

alter table public.picks
  drop constraint picks_moneyline_pick_fkey;

alter table public.picks rename column moneyline_pick to total_pick;
alter table public.picks rename column moneyline_correct to total_correct;

-- Existing values are team abbreviations. There is no honest way to map a team
-- to over or under, so they are cleared rather than guessed at. Spread picks
-- are untouched.
update public.picks set total_pick = null, total_correct = null;

alter table public.picks
  add constraint picks_total_pick_values
  check (total_pick is null or total_pick in ('OVER', 'UNDER'));

-- A column rename carries its privileges, but re-stating the grant keeps the
-- security model readable in one place: authenticated may write only the two
-- pick columns, never the grading columns.
revoke update on public.picks from authenticated;
grant update (total_pick, spread_pick) on public.picks to authenticated;
