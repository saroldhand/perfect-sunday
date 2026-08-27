-- Applying a week's scores from a feed, and grading in the same breath.
--
-- The consequential half of sync-scores, kept in SQL where it can be tested —
-- the same split 0016 makes for lines. The Edge Function's job reduces to:
-- fetch, normalise, call this, report what happened.
--
-- Three rules it enforces, none of them safe to leave to a caller:
--
--   1. Only a locked week accepts feed scores. Before lock there is nothing to
--      score against — a score arriving for an open week means the lock job
--      failed, which is not the feed's problem to paper over. After `scored`
--      the results are published and must never be rewritten by a feed.
--      Returning rather than raising keeps a scheduled job idempotent: it can
--      sweep a week that scored since it last ran without failing the run.
--   2. A final is final. Once a game's status is 'final' the feed cannot touch
--      it again: its grades may already be on someone's screen, and a stat
--      correction that flips them is the operator's deliberate call — via
--      private.set_final_score, which stays the manual path — not something a
--      feed hiccup does on its own. In-progress scores move freely until then.
--   3. Grading runs in the same call whenever any game stands final, through
--      the same idempotent private.score_week the cron sweep uses. That is
--      what makes a pick flip green within one client poll of the game
--      ending, instead of waiting for a separate sweep to notice.

create or replace function private.apply_week_scores(
  p_week_id int,
  -- [{"externalId": "2026-01-NE-SEA", "homeScore": 24, "awayScore": 17,
  --   "status": "in_progress" | "final"}, ...]
  p_scores jsonb
)
returns table (updated int, finals int, remaining int, week_scored boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.week_status;
  v_updated int := 0;
  v_finals int;
  v_remaining int;
  v_week_scored boolean := false;
begin
  select status into v_status from public.weeks where id = p_week_id;

  if v_status is null then
    raise exception 'no such week: %', p_week_id;
  end if;

  -- Rule 1. Anything but locked is closed to the feed.
  if v_status <> 'locked' then
    select count(*) filter (where g.status = 'final'),
           count(*) filter (where g.status <> 'final')
    into v_finals, v_remaining
    from public.games g where g.week_id = p_week_id;
    return query select 0, v_finals, v_remaining, v_status = 'scored';
    return;
  end if;

  -- Rule 2 is the g.status <> 'final' predicate. The payload status is
  -- whitelisted before the enum cast, and a row missing either score is
  -- skipped whole — a half-written score would grade as a real one.
  update public.games g set
    home_score = v."homeScore",
    away_score = v."awayScore",
    status = v.status::public.game_status
  from jsonb_to_recordset(p_scores) as v (
    "externalId" text, "homeScore" int, "awayScore" int, status text
  )
  where g.week_id = p_week_id
    and g.external_id = v."externalId"
    and g.status <> 'final'
    and v.status in ('in_progress', 'final')
    and v."homeScore" is not null
    and v."awayScore" is not null;

  get diagnostics v_updated = row_count;

  select count(*) filter (where g.status = 'final'),
         count(*) filter (where g.status <> 'final')
  into v_finals, v_remaining
  from public.games g where g.week_id = p_week_id;

  -- Rule 3. score_week only grades games standing final and recomputes entry
  -- totals by aggregate, so calling it on every sweep that has any final is
  -- safe — that idempotency is scoring.sql's oldest assertion. It also flips
  -- the week to scored itself once the last game is in.
  if v_finals > 0 then
    select sw.all_games_final into v_week_scored
    from private.score_week(p_week_id) sw;
  end if;

  return query select v_updated, v_finals, v_remaining, coalesce(v_week_scored, false);
end;
$$;

comment on function private.apply_week_scores is
  'Writes a week''s in-progress and final scores and grades whatever stands final, in one call. Only a locked week accepts writes; a final game is never rewritten. See OPERATIONS.md.';

-- The week sync-scores should be working on: the earliest locked week that
-- still has an unfinished game and whose slate has actually started. Before
-- the first kickoff there is nothing a scores feed could know, so the job
-- reports nothing-to-do without a fetch. A locked week whose games are all
-- final leaves this queue on the sweep that graded it (rule 3 flips it to
-- scored); if that call ever dies between write and grade, score_due_weeks
-- (0014) remains the scheduled backstop.
create or replace function private.next_week_needing_scores()
returns int
language sql
security definer
set search_path = ''
as $$
  select w.id
  from public.weeks w
  where w.status = 'locked'
    and exists (
      select 1 from public.games g
      where g.week_id = w.id and g.status <> 'final'
    )
    and exists (
      select 1 from public.games g
      where g.week_id = w.id and g.kickoff_at <= now()
    )
  order by w.locks_at
  limit 1;
$$;

comment on function private.next_week_needing_scores is
  'Earliest locked week with a started slate and at least one unfinished game, or NULL when nothing needs syncing.';

-- Service-role-only doors, exactly as 0016 cut them for lines: `private` is
-- not PostgREST-exposed, so the Edge Function needs wrappers in `public`, and
-- a new function's default EXECUTE-to-PUBLIC grant would put score-writing —
-- and through rule 3, grading — within reach of the publishable key that
-- ships in the build. Revoked from everyone, granted back to service_role
-- alone.

create or replace function public.sync_apply_week_scores(
  p_week_id int,
  p_scores jsonb
)
returns table (updated int, finals int, remaining int, week_scored boolean)
language sql
security definer
set search_path = ''
as $$
  select * from private.apply_week_scores(p_week_id, p_scores);
$$;

create or replace function public.sync_next_week_needing_scores()
returns int
language sql
security definer
set search_path = ''
as $$
  select private.next_week_needing_scores();
$$;

revoke execute on function public.sync_apply_week_scores(int, jsonb)
  from public, anon, authenticated;
revoke execute on function public.sync_next_week_needing_scores()
  from public, anon, authenticated;

grant execute on function public.sync_apply_week_scores(int, jsonb) to service_role;
grant execute on function public.sync_next_week_needing_scores() to service_role;
