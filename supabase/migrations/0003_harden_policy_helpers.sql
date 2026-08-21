-- The two policy helpers were reachable as PostgREST RPC endpoints, which the
-- security linter flagged. Neither is meant to be part of the public API.

-- game_week_status only reads games and weeks, both of which are world-readable
-- already. It never needed definer rights, so invoker rights close the hole
-- without changing behaviour.
create or replace function public.game_week_status(p_game_id uuid)
returns public.week_status
language sql
security invoker
set search_path = ''
stable
as $$
  select w.status
  from public.games g
  join public.weeks w on w.id = g.week_id
  where g.id = p_game_id;
$$;

-- is_group_member genuinely needs definer rights: it is called from
-- group_members' own policies and would otherwise recurse. Instead of relaxing
-- it, move it out of the schema PostgREST exposes. Policies track the function
-- by OID, so they follow it across the move and keep working.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.is_group_member(uuid) set schema private;

revoke all on function private.is_group_member(uuid) from public;
grant execute on function private.is_group_member(uuid) to authenticated;
