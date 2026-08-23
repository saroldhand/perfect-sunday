-- Rewrites the scoring functions for the total/spread format. Same contract as
-- before: idempotent, private schema, entries never created outside lock_week.

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
    count(p.total_pick) + count(p.spread_pick),
    v_possible,
    0, true, true, false
  from public.picks p
  join public.games g on g.id = p.game_id
  where g.week_id = p_week_id
  group by p.user_id
  having count(p.total_pick) + count(p.spread_pick) = v_possible
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

  -- Both layers treat a landed number as correct for whoever picked either
  -- side: a combined score exactly on the total, and a spread that lands
  -- exactly on the number. Generous on purpose — it avoids arguments, and
  -- half-point lines make it rare.
  update public.picks p
  set
    total_correct = case
      when p.total_pick is null or g.total is null then null
      when (g.home_score + g.away_score) = g.total then true
      when p.total_pick = 'OVER' then (g.home_score + g.away_score) > g.total
      when p.total_pick = 'UNDER' then (g.home_score + g.away_score) < g.total
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
      count(p.total_pick) + count(p.spread_pick) as made,
      (count(*) filter (where p.total_correct))
        + (count(*) filter (where p.spread_correct)) as correct,
      bool_or(p.total_correct is false or p.spread_correct is false) as has_miss
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
