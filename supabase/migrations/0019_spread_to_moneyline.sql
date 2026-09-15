-- Replaces the spread layer with a moneyline layer. Each game is still two
-- picks: the total, and the moneyline — which team wins outright.
--
-- WHY. The spread layer made the game needlessly unwinnable. SPEC §2 chose
-- moneyline + spread at ~1 in 19.9M and explicitly rejected pushing the odds
-- to ~1 in 665M as "needlessly unwinnable ... a lottery rather than a skill
-- contest". Migration 0007 then did exactly that by replacing the moneyline
-- with a total, leaving the live format at spread + total — the rejected one.
--
-- At SPEC's own assumed hit rates (66% moneyline, 53% each of spread and
-- total) this migration lands the product back on the risk the spec chose:
--
--   spread + total   (0007 .. 0018)  53% / 53%   ~1 in 665,500,000
--   moneyline + total (this)         66% / 53%   ~1 in  19,900,000
--   moneyline + spread (SPEC §2)     66% / 53%   ~1 in  19,900,000
--
-- The last two are the same number, because it is the same pair of hit rates.
-- So the prize risk argument in SPEC §2 carries over untouched: at 10,000
-- weekly entries across an 18-week season, expected payouts stay under $10.
-- A perfect week is still functionally unwinnable; it is now unwinnable at the
-- level the spec signed off on, and a user gets 12-14 of 16 on the layer that
-- is supposed to feel winnable.
--
-- WHAT MOVES. `games.spread` is dropped rather than left in place. Nothing
-- would write it after this migration, and a stale market number sitting in a
-- column the UI might later read is the precise shape of the failure
-- OPERATIONS.md calls the worst one this product has. It is recoverable: the
-- nflverse feed carries spread_line for every week it carries a moneyline for.
--
-- Existing spread picks are cleared rather than carried across, the same
-- decision 0007 made in the other direction. A rename would silently reinterpret
-- "KC to cover -3.5" as "KC to win outright" — a different bet, made against a
-- number this migration deletes. There is no honest mapping, so there is no
-- mapping. (This database: 0 pick rows and 0 entry rows, so it clears nothing.
-- On any database that did hold graded spread picks, the affected `entries`
-- counts would need private.score_week re-run for those weeks, because their
-- correct_count still includes spread grades whose picks are now gone.)

-- 1. games: the moneyline pair returns, the spread goes.
--
-- Both sides are stored, not just the favourite's price, because the deck shows
-- each side its own American odds and +180/-218 only mean anything together.
alter table public.games
  add column moneyline_home int,
  add column moneyline_away int;

alter table public.games
  drop column spread;

comment on column public.games.moneyline_home is
  'American odds on the home team winning outright, e.g. -218. Display only: which side won does not depend on the price, so scoring never reads it.';
comment on column public.games.moneyline_away is
  'American odds on the away team winning outright, e.g. +180.';

-- 2. picks: spread_pick becomes moneyline_pick.
--
-- A rename rather than a drop-and-add, so the column keeps its foreign key to
-- teams — both layers pick a club, which is the one way this change is simpler
-- than 0007, where a team abbreviation had to become 'OVER'/'UNDER'. The
-- constraint keeps its old name through a column rename, so it is renamed too;
-- a constraint called picks_spread_pick_fkey on a column called moneyline_pick
-- is how the next person reading this schema gets misled.
alter table public.picks rename column spread_pick to moneyline_pick;
alter table public.picks rename column spread_correct to moneyline_correct;

alter table public.picks
  rename constraint picks_spread_pick_fkey to picks_moneyline_pick_fkey;

-- See WHAT MOVES above: these were bets against a number this migration drops.
update public.picks
set moneyline_pick = null, moneyline_correct = null
where moneyline_pick is not null or moneyline_correct is not null;

-- A column rename carries its privileges, but re-stating the grant keeps the
-- security model readable in one place: authenticated may write only the two
-- pick columns, never the grading columns. Same reasoning as 0007.
revoke update on public.picks from authenticated;
grant update (total_pick, moneyline_pick) on public.picks to authenticated;

-- 3. What makes a line complete, in one place.
--
-- The rule grew a term — it was (spread, total), it is now (moneyline_home,
-- moneyline_away, total) — and it is asserted in three places below. Three
-- copies of a three-term predicate is how "complete" comes to mean two
-- different things in two functions, so it gets a name instead.
--
-- over_odds and under_odds are deliberately NOT part of it, exactly as before:
-- the total's own price is decoration, and the provider already drops a row
-- missing any of its numbers, so it is stricter than the database needs to be.
create or replace function private.line_complete(
  p_moneyline_home int,
  p_moneyline_away int,
  p_total numeric
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_moneyline_home is not null
     and p_moneyline_away is not null
     and p_total is not null;
$$;

comment on function private.line_complete is
  'Whether a game carries a pickable line. A week opens only when this is true of every game on its slate. See SPEC §5.';

revoke all on function private.line_complete(int, int, numeric) from public;

-- 4. An open week whose slate is no longer complete goes back to upcoming.
--
-- Dropping `spread` leaves every already-open week with a total but no
-- moneyline, which is a week the deck cannot render and nobody can pick. SPEC
-- §5's invariant is that an open week has a complete line for every game, and
-- this restores it rather than leaving the app to guard against a state the
-- database should not be in.
--
-- The week then re-opens through the normal path: it is once again what
-- private.next_week_needing_lines returns, sync-slate fills the moneylines, and
-- apply_week_lines opens it only when nothing is missing. No status is forced
-- open by hand.
--
-- Only `open` weeks are touched. A locked or scored week is history and its
-- status is never rewritten — rule 1 below is the same promise.
update public.weeks w
set status = 'upcoming'
where w.status = 'open'
  and exists (
    select 1 from public.games g
    where g.week_id = w.id
      and not private.line_complete(g.moneyline_home, g.moneyline_away, g.total)
  );

-- 5. Scoring, rewritten for the moneyline layer. Same contract as 0006/0008:
-- idempotent, private schema, entries never created outside lock_week.

create or replace function private.lock_week(p_week_id int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_possible int;
  v_created int;
begin
  select count(*) * 2 into v_possible
  from public.games where week_id = p_week_id;

  update public.weeks set status = 'locked'
  where id = p_week_id and status = 'open';

  insert into public.entries (
    user_id, week_id, picks_made, picks_possible,
    correct_count, is_complete, is_alive, is_perfect
  )
  select
    p.user_id,
    p_week_id,
    count(p.total_pick) + count(p.moneyline_pick),
    v_possible,
    0, true, true, false
  from public.picks p
  join public.games g on g.id = p.game_id
  where g.week_id = p_week_id
  group by p.user_id
  having count(p.total_pick) + count(p.moneyline_pick) = v_possible
  on conflict (user_id, week_id) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

create or replace function private.score_week(p_week_id int)
returns table (entries_updated int, all_games_final boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_possible int;
  v_all_final boolean;
  v_updated int;
begin
  select count(*) * 2, bool_and(status = 'final')
  into v_possible, v_all_final
  from public.games where week_id = p_week_id;

  -- Two things to know about the CASE arms below.
  --
  -- The null guard comes FIRST on both layers. 0006 graded the moneyline with
  -- the tie arm first, which set moneyline_correct = true on a drawn game for
  -- a row where moneyline_pick was null — crediting a pick nobody made. It
  -- could not bite then, because a tie is rare and 0007 replaced the layer
  -- before one happened. Ordering the guard first is the fix, and
  -- supabase/tests/scoring.sql now asserts it.
  --
  -- The moneyline guard does not mention the odds, where the total's guard
  -- does mention g.total. That asymmetry is deliberate, not an oversight: a
  -- total cannot be graded without the number it is compared against, but who
  -- won outright does not depend on the price they were offered at. The odds
  -- are display only.
  --
  -- A tie counts correct for whoever picked either side, and a combined score
  -- landing exactly on the total does the same. Generous on purpose — it avoids
  -- arguments, and half-point totals make that rare. The moneyline has no
  -- half-point equivalent, so ties are the one push it can produce.
  update public.picks p
  set
    total_correct = case
      when p.total_pick is null or g.total is null then null
      when (g.home_score + g.away_score) = g.total then true
      when p.total_pick = 'OVER' then (g.home_score + g.away_score) > g.total
      when p.total_pick = 'UNDER' then (g.home_score + g.away_score) < g.total
      else null
    end,
    moneyline_correct = case
      when p.moneyline_pick is null then null
      when g.home_score = g.away_score then true
      when p.moneyline_pick = g.home_team then g.home_score > g.away_score
      when p.moneyline_pick = g.away_team then g.away_score > g.home_score
      else null
    end
  from public.games g
  where g.id = p.game_id
    and g.week_id = p_week_id
    and g.status = 'final'
    and g.home_score is not null
    and g.away_score is not null;

  with totals as (
    select
      p.user_id,
      count(p.total_pick) + count(p.moneyline_pick) as made,
      (count(*) filter (where p.total_correct))
        + (count(*) filter (where p.moneyline_correct)) as correct,
      bool_or(p.total_correct is false or p.moneyline_correct is false) as has_miss
    from public.picks p
    join public.games g on g.id = p.game_id
    where g.week_id = p_week_id
    group by p.user_id
  )
  update public.entries e
  set picks_made = t.made,
      picks_possible = v_possible,
      correct_count = t.correct,
      is_complete = t.made = v_possible,
      is_alive = not coalesce(t.has_miss, false),
      is_perfect = coalesce(v_all_final, false)
        and t.made = v_possible
        and t.correct = v_possible
  from totals t
  where e.user_id = t.user_id and e.week_id = p_week_id;

  get diagnostics v_updated = row_count;

  if coalesce(v_all_final, false) then
    update public.weeks set status = 'scored' where id = p_week_id;
  end if;

  return query select v_updated, coalesce(v_all_final, false);
end;
$$;

revoke all on function private.lock_week(int) from public;
revoke all on function private.score_week(int) from public;

-- 6. The line pipeline. Same three rules as 0016, restated against the new
-- columns; the signature is unchanged, so the service-role grants in 0016 and
-- the public.sync_* wrappers stay as they are.
--
--   1. Lines are only writable while the week is `upcoming` or `open`.
--   2. A week opens only when every game on its slate has a complete line.
--   3. line_source is stored per game, from the caller, never defaulted.
create or replace function private.apply_week_lines(
  p_week_id int,
  p_line_source text,
  -- [{"externalId": "...", "moneylineHome": -218, "moneylineAway": 180,
  --   "total": 53.5, "overOdds": -110, "underOdds": -110}, ...]
  p_lines jsonb
)
returns table (updated int, missing int, opened boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.week_status;
  v_updated int := 0;
  v_missing int;
  v_opened boolean := false;
begin
  select status into v_status from public.weeks where id = p_week_id;

  if v_status is null then
    raise exception 'no such week: %', p_week_id;
  end if;

  if p_line_source is null or btrim(p_line_source) = '' then
    raise exception 'line_source is required: a line with no stated source cannot be graded against';
  end if;

  -- Rule 1. A locked or scored week is closed to the feed. Returning rather
  -- than raising keeps a scheduled job idempotent: it can sweep a week that
  -- locked since it last ran without failing the run.
  if v_status in ('locked', 'scored') then
    select count(*)::int into v_missing
    from public.games
    where week_id = p_week_id
      and not private.line_complete(moneyline_home, moneyline_away, total);
    return query select 0, v_missing, false;
    return;
  end if;

  update public.games g set
    moneyline_home = v."moneylineHome",
    moneyline_away = v."moneylineAway",
    total = v.total,
    over_odds = v."overOdds",
    under_odds = v."underOdds",
    line_source = p_line_source
  from jsonb_to_recordset(p_lines) as v (
    "externalId" text, "moneylineHome" int, "moneylineAway" int,
    total numeric, "overOdds" int, "underOdds" int
  )
  where g.week_id = p_week_id and g.external_id = v."externalId";

  get diagnostics v_updated = row_count;

  select count(*)::int into v_missing
  from public.games
  where week_id = p_week_id
    and not private.line_complete(moneyline_home, moneyline_away, total);

  -- Rule 2. An empty slate is not a complete one — a week with no games rows
  -- would otherwise satisfy "nothing is missing" and open onto an empty deck.
  if v_missing = 0 and v_status = 'upcoming'
     and exists (select 1 from public.games where week_id = p_week_id) then
    update public.weeks set status = 'open' where id = p_week_id;
    v_opened := true;
  end if;

  return query select v_updated, v_missing, v_opened;
end;
$$;

comment on function private.apply_week_lines is
  'Writes a week''s lines and opens the week once no game is missing one. Refuses to touch a locked or scored week. See OPERATIONS.md.';

create or replace function private.next_week_needing_lines()
returns int
language sql
security definer
set search_path = ''
as $$
  select w.id
  from public.weeks w
  where w.status = 'upcoming'
    and w.locks_at > now()
    and exists (
      select 1 from public.games g
      where g.week_id = w.id
        and not private.line_complete(g.moneyline_home, g.moneyline_away, g.total)
    )
  order by w.locks_at
  limit 1;
$$;

comment on function private.next_week_needing_lines is
  'Earliest not-yet-locked week with at least one game missing a line, or NULL when nothing needs syncing.';

revoke all on function private.apply_week_lines(int, text, jsonb) from public;
revoke all on function private.next_week_needing_lines() from public;
