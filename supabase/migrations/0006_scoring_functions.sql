-- Manual scoring for Phase 1. These are the operator's tools; the scheduled
-- Edge Functions of Phase 2 will call the same logic.
--
-- They live in `private` because PostgREST does not expose that schema, so
-- there is no RPC endpoint a signed-in user could hit to grade their own
-- entry. The operator runs them as the owning role.
--
-- Everything here is idempotent. Grading is a pure function of (pick, result),
-- so re-running overwrites with identical values rather than accumulating, and
-- entry totals are recomputed by aggregate rather than incremented.

-- Record a final score. Takes the provider-facing external_id rather than the
-- uuid so an operator can type it from the slate.
create or replace function private.set_final_score(
  p_week_id int,
  p_external_id text,
  p_home_score int,
  p_away_score int
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.games
  set home_score = p_home_score,
      away_score = p_away_score,
      status = 'final'
  where week_id = p_week_id and external_id = p_external_id;
$$;

-- Freeze the week and create entries. Only users with a complete set get one:
-- an incomplete picker is not scored and does not appear on the leaderboard,
-- though their pick rows stay for their own history.
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
    count(p.moneyline_pick) + count(p.spread_pick),
    v_possible,
    0, true, true, false
  from public.picks p
  join public.games g on g.id = p.game_id
  where g.week_id = p_week_id
  group by p.user_id
  having count(p.moneyline_pick) + count(p.spread_pick) = v_possible
  on conflict (user_id, week_id) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

-- Grade every final game in the week, then recompute the entries that exist.
-- Entries are never created here: a user who did not have a complete set at
-- lock stays off the board no matter what their picks did.
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

  -- A tie counts correct for both moneyline picks, and a spread that lands
  -- exactly on the number counts correct for both sides. Generous on purpose:
  -- it avoids arguments, and half-point lines make pushes rare anyway.
  update public.picks p
  set
    moneyline_correct = case
      when g.home_score = g.away_score then true
      when p.moneyline_pick = g.home_team then g.home_score > g.away_score
      when p.moneyline_pick = g.away_team then g.away_score > g.home_score
      else null
    end,
    spread_correct = case
      when p.spread_pick is null or g.spread is null then null
      when (g.home_score + g.spread) = g.away_score then true
      when p.spread_pick = g.home_team then (g.home_score + g.spread) > g.away_score
      when p.spread_pick = g.away_team then (g.home_score + g.spread) < g.away_score
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
      count(p.moneyline_pick) + count(p.spread_pick) as made,
      (count(*) filter (where p.moneyline_correct))
        + (count(*) filter (where p.spread_correct)) as correct,
      bool_or(p.moneyline_correct is false or p.spread_correct is false) as has_miss
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

-- Nothing outside the owning role may execute these.
revoke all on function private.set_final_score(int, text, int, int) from public;
revoke all on function private.lock_week(int) from public;
revoke all on function private.score_week(int) from public;
