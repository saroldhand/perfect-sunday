-- Applying a week's lines, and opening the week when the slate is complete.
--
-- This is the consequential half of sync-slate, so it lives in SQL where it can
-- be tested rather than in the Edge Function where it cannot. The function's
-- job reduces to: fetch, normalise, call this, report what happened.
--
-- Three rules it enforces, all of them things SPEC insists on and none of them
-- safe to leave to a caller:
--
--   1. Lines are only writable while the week is `upcoming` or `open`. Once a
--      week locks, its numbers are what people were graded against and must
--      never move. SPEC §4: "Once weeks.status flips to locked, spread must
--      never be rewritten by the feed."
--   2. A week opens only when every game on its slate has a complete line.
--      Partial lines never open a week, and a placeholder is never written.
--      SPEC §5.
--   3. line_source is stored per game, from the caller, and never defaulted to
--      a book name. A line graded against a source the user never saw is the
--      worst failure this product has.

create or replace function private.apply_week_lines(
  p_week_id int,
  p_line_source text,
  -- [{"externalId": "...", "spread": -3.5, "total": 44.5,
  --   "overOdds": -110, "underOdds": -110}, ...]
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
    from public.games where week_id = p_week_id and (spread is null or total is null);
    return query select 0, v_missing, false;
    return;
  end if;

  update public.games g set
    spread = v.spread,
    total = v.total,
    over_odds = v."overOdds",
    under_odds = v."underOdds",
    line_source = p_line_source
  from jsonb_to_recordset(p_lines) as v (
    "externalId" text, spread numeric, total numeric,
    "overOdds" int, "underOdds" int
  )
  where g.week_id = p_week_id and g.external_id = v."externalId";

  get diagnostics v_updated = row_count;

  select count(*)::int into v_missing
  from public.games where week_id = p_week_id and (spread is null or total is null);

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

-- The week sync-slate should be working on: the earliest week that has not
-- locked yet and still needs lines. Mirrors selectCurrentWeek in the app —
-- ordered by locks_at, because a week number does not tell you whether it has
-- happened.
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
      where g.week_id = w.id and (g.spread is null or g.total is null)
    )
  order by w.locks_at
  limit 1;
$$;

comment on function private.next_week_needing_lines is
  'Earliest not-yet-locked week with at least one game missing a line, or NULL when nothing needs syncing.';

-- Service-role-only wrappers, so sync-slate can reach the two functions above.
--
-- `private` is not in PostgREST's exposed schemas — that is the whole reason
-- the scoring functions live there, and it is what stops a signed-in user
-- grading their own entry. So an Edge Function cannot call into it by RPC
-- either, and needs a door in `public`.
--
-- The door is only as safe as its grants. EXECUTE is granted on a new function
-- to PUBLIC by default, which would put line-writing within reach of anyone
-- holding the publishable key that ships in the build. So it is revoked from
-- everyone and granted back to `service_role` alone — a key that lives only in
-- the Edge Function's environment and never reaches a browser.
--
-- The alternative was to let the function write games rows directly with the
-- service role and keep the rules in TypeScript. The rules — never touch a
-- locked week, never open an incomplete one — are the part that must not be
-- wrong, so they stay in SQL where supabase/tests/lines.sql can assert them.

create or replace function public.sync_apply_week_lines(
  p_week_id int,
  p_line_source text,
  p_lines jsonb
)
returns table (updated int, missing int, opened boolean)
language sql
security definer
set search_path = ''
as $$
  select * from private.apply_week_lines(p_week_id, p_line_source, p_lines);
$$;

create or replace function public.sync_next_week_needing_lines()
returns int
language sql
security definer
set search_path = ''
as $$
  select private.next_week_needing_lines();
$$;

revoke execute on function public.sync_apply_week_lines(int, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.sync_next_week_needing_lines()
  from public, anon, authenticated;

grant execute on function public.sync_apply_week_lines(int, text, jsonb) to service_role;
grant execute on function public.sync_next_week_needing_lines() to service_role;
