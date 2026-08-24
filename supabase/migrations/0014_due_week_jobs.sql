-- Schedulable wrappers around lock_week and score_week.
--
-- SPEC §5 files all three Phase 2 jobs as Edge Functions. That is right for
-- sync-slate, which makes an outbound HTTPS call to an odds aggregator. It is
-- wrong for the other two: lock_week and score_week are pure SQL over tables in
-- this database and call nothing outside it. Routing them through an Edge
-- Function would add an HTTP hop, a service-role key in a function secret, and
-- a deploy step, to reach a function that is already sitting in the same
-- database pg_cron runs in.
--
-- So these two get scheduled with pg_cron calling them directly, and only
-- sync-slate stays an Edge Function. That also keeps the service-role key out
-- of the automation entirely: pg_cron runs as the database owner, and these
-- functions are already security definer in a schema PostgREST does not expose.
--
-- What the wrappers add over the functions they call is *week selection*. A
-- scheduled job has no argument to pass, so each one finds the weeks that are
-- due by status and clock, which is the part an operator was doing by eye.
--
-- Both are idempotent, and their idempotence is structural rather than
-- defensive: each selects on the status its own work moves the week out of, so
-- a second run in the same minute finds nothing left to do.

-- Locks every open week whose posted lock time has passed.
--
-- Selecting on `locks_at <= now()` rather than on a clock the job is trusted to
-- be woken at means a missed or delayed run still locks the week on its next
-- tick, late but correct. It does not need to fire exactly at 4:00.
create or replace function private.lock_due_weeks()
returns table (week_id int, entries_created int)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select w.id, private.lock_week(w.id)
  from public.weeks w
  where w.status = 'open'
    and w.locks_at <= now()
  order by w.id;
end;
$$;

-- Grades every locked week.
--
-- Scoped to `locked` on purpose. score_week flips a week to `scored` once every
-- game is final, so a finished week drops out of this job's sights and stays
-- out — a scored week is a published result, and a job that kept rewriting one
-- would be free to change a result nobody expected to move. Correcting a score
-- after the fact stays a deliberate manual call to score_week, per
-- OPERATIONS.md.
create or replace function private.score_due_weeks()
returns table (week_id int, entries_updated int, all_games_final boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select w.id, s.entries_updated, s.all_games_final
  from public.weeks w
  cross join lateral private.score_week(w.id) s
  where w.status = 'locked'
  order by w.id;
end;
$$;

comment on function private.lock_due_weeks is
  'Locks every open week past its locks_at. Idempotent; safe to run on a timer. See OPERATIONS.md for the pg_cron schedule.';

comment on function private.score_due_weeks is
  'Grades every locked week. Idempotent; a week leaves this job when score_week flips it to scored.';

-- Deliberately NOT scheduled here. Turning automation on changes what the
-- database does while nobody is watching, and this project is still a proof of
-- concept whose demo week is driven by hand. The cron.schedule statements live
-- in OPERATIONS.md so switching them on is an explicit act with a matching
-- statement to switch them off again.
