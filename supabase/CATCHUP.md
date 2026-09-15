# Catching the database up after the pause

Written 2026-09-15, the Tuesday after Week 1 ended. One-time runbook, unlike
[OPERATIONS.md](OPERATIONS.md), which is the evergreen reference — every step
here exists because the Supabase project was paused across the season opener
and the database is nineteen days behind the repo. Delete this file once the
last box is ticked.

**Nothing in here could be verified against production.** The session that
wrote it had no route to the database: the pinned MCP server in `.mcp.json`
runs `cmd /c`, which does not exist off Windows, and this session's egress
policy denies `*.supabase.co`, so the REST fallback was refused too. Every
step therefore starts by *reading* state rather than assuming it. Run the
probes; if one disagrees with what is written here, trust the probe.

## Where the clock actually is

| | |
|---|---|
| Week 1 locked | Wed 9 Sep, 7:50 PM ET — **past** |
| Week 1 finished | Mon 14 Sep, 8:15 PM ET (MNF) — **past**, all 16 games |
| **Week 2 locks** | **Thu 17 Sep, 4:00 PM ET** |
| Week 2 first kickoff | Thu 17 Sep, 8:15 PM ET |

So the deadline that matters is Thursday 4:00 PM ET. Week 2's lines have to be
in and the week open before then, or Week 2 is lost the same way Week 1 was.
Lines land on Tuesdays, which is today.

## Step 0 — read the state before changing any of it

Paste the whole block into the SQL editor. It writes nothing.

```sql
-- Which migrations landed? Every column should read 1. `m0007` is the
-- over/under conversion the later queries in this block depend on; if it
-- reads 0, stop — the database is older than the deployed app.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='games' and column_name='total') as m0007,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='teams' and column_name='stats_season') as m0013,
  (select count(*) from information_schema.routines
    where routine_schema='private' and routine_name='lock_due_weeks')      as m0014,
  (select count(*) from information_schema.routines
    where routine_schema='private' and routine_name='apply_week_lines')    as m0016,
  (select count(*) from information_schema.routines
    where routine_schema='private' and routine_name='apply_week_scores')   as m0017;

-- 0015: expect 18 weeks and 272 games for 2026.
select count(distinct w.id) as weeks_2026, count(g.id) as games_2026
from public.weeks w left join public.games g on g.week_id = w.id
where w.season = 2026;

-- Every week that is not `upcoming`, plus the demo. Expect exactly one row:
-- 2025 week 18, status `open`.
select season, week_number, status, locks_at
from public.weeks where status <> 'upcoming' order by season, week_number;

-- Did anyone actually play Week 1? Expect zeros — the project was paused.
-- `picks` has no week_id; a pick reaches its week through its game.
select
  (select count(*) from public.picks p
     join public.games g on g.id = p.game_id
     join public.weeks w on w.id = g.week_id
     where w.season=2026 and w.week_number=1) as week1_picks,
  (select count(*) from public.entries e
     join public.weeks w on w.id = e.week_id
     where w.season=2026 and w.week_number=1) as week1_entries,
  (select count(*) from public.profiles)      as profiles;

-- Lines and scores per week, weeks 1-3.
select w.week_number, count(*) as games,
       count(*) filter (where g.spread is null or g.total is null) as missing_lines,
       count(*) filter (where g.status = 'final') as finals
from public.games g join public.weeks w on w.id = g.week_id
where w.season = 2026 and w.week_number <= 3
group by w.week_number order by w.week_number;

-- Anything already on a timer? Expect no rows. (Errors if pg_cron is absent,
-- which is itself the answer.)
select jobname, schedule, active from cron.job;
```

## Step 1 — apply whatever Step 0 says is missing

Run the migration files in `migrations/` in numeric order, skipping the ones
already applied. `0017_sync_scores.sql` is the one known to be outstanding —
the [TODO](../docs/TODO.md) has it unticked and nothing has run since.

After 0017, run [tests/scores.sql](tests/scores.sql) in the editor and expect
**21 of 21 PASS**. Run [tests/lines.sql](tests/lines.sql) and
[tests/jobs.sql](tests/jobs.sql) too if Step 0 showed 0016 or 0014 missing.

## Step 2 — retire the demo week

This is the one that is actively breaking the live site right now.
`selectCurrentWeek` prefers any `open` or `locked` week over everything else,
and the 2025 Week 18 demo is still `open` — so the deployed app has been
showing a 2025 demo slate through the whole opening week.

```sql
delete from public.weeks where season = 2025 and week_number = 18;
```

**Delete rather than mark it `scored`**, which is the opposite of what
OPERATIONS.md suggested before the season started, and the reason is
`getLastScoredWeek`: it orders by season descending and takes the first
`scored` week, so a `scored` 2025 demo becomes "the most recent finished week"
and the board would show demo results to anyone who opens the app before Week 2
locks. No 2026 week is scored yet to outrank it. Deleting cascades to the
demo's games, picks and entries; the season table is unaffected either way,
because `getSeasonEntries` filters on `weeks.season`.

Verify the app now resolves to Week 2:

```sql
-- Expect 2026 week 2 — the earliest upcoming week whose lock is still ahead.
select season, week_number, status, locks_at from public.weeks
where status = 'upcoming' and locks_at > now()
order by locks_at limit 1;
```

## Step 3 — leave Week 1 alone, deliberately

Week 1 is over and nobody played it. Assuming Step 0 returned zeros, the
correct action is **none**: leave it `upcoming` and let the season start at
Week 2.

It is inert where it sits, which is worth knowing rather than trusting:

- `private.next_week_needing_lines()` filters on `locks_at > now()`, so
  `sync-slate` will never select Week 1 again.
- `private.lock_due_weeks()` only looks at `open` weeks, so it will never lock
  it.
- `private.next_week_needing_scores()` only looks at `locked` weeks, so
  `sync-scores` will never fetch it.
- `selectCurrentWeek` skips it: rule 2 requires `locks_at > now()`.
- The season table counts `scored` weeks only, so it contributes nothing.

**Do not backfill it.** Writing Week 1's closing lines in now and grading
against them would be the exact failure OPERATIONS.md singles out as the worst
this product has — grading people against a line they were never shown — with
the added absurdity that there are no picks to grade. If tidiness itches, the
honest marker is a status the schema does not have; `upcoming` in the past is
the least wrong of the options available.

One guardrail while it sits there: **never pass Week 1's id to `sync-slate`
by hand.** `apply_week_lines` has no clock guard of its own — only the week
selector does — so an explicit `{"weekId": <week 1>}` would fill its lines and
flip a finished week to `open`, with picks writable on games already played.
Let the function choose the week.

*If Step 0 showed Week 1 picks after all* (someone played before the pause),
stop and decide deliberately. The path is then the ordinary one — lines are
already in if they picked against them, so `private.lock_week(...)` then
`sync-scores` or manual `set_final_score` per OPERATIONS.md steps 2–3 — but
whether to run a week whose games finished before it was ever locked is a call
about the contest's integrity, not a SQL step.

## Step 4 — get Week 2 open, before Thursday 4:00 PM ET

The functions are in the repo but have never been deployed:

```bash
supabase functions deploy sync-slate
supabase functions deploy sync-scores
```

Then pull Week 2's lines. With the demo gone and Week 1 filtered out by the
clock, the no-argument call selects Week 2 on its own:

```bash
curl -X POST "https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-slate" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Read the report. `missing: 0` with `opened: true` means Week 2 is taking picks.
`missing` above zero means the feed was short and the week correctly stayed
shut — re-run it on the hour, or fill the gaps with the manual `VALUES`
fallback in OPERATIONS.md. A week that will not open is the thing to catch
today, not Thursday afternoon.

## Step 5 — switch the automation on

Left off all season because the demo week was driven by hand. That reason is
now gone, and the pause just demonstrated the cost: a week nobody was watching
is a week that does not happen.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('lock-due-weeks',  '*/10 * * * *', $$select private.lock_due_weeks()$$);
select cron.schedule('score-due-weeks', '*/10 * * * *', $$select private.score_due_weeks()$$);

select cron.schedule('sync-slate', '0 * * * *', $$
  select net.http_post(
    url := 'https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-slate',
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
$$);

select cron.schedule('sync-scores', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-scores',
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
$$);
```

All four are idempotent and cheap when idle. `cron.schedule` runs in UTC;
none of these needs a wall-clock time, which is the point of selecting by
status and `locks_at`.

If the pause dropped jobs that had been scheduled before it, `cron.schedule`
with an existing name replaces it, so re-running the block is safe.

## Step 6 — watch Thursday and Sunday by hand, once

Two checks that only the first live run can settle:

1. **Thursday just after 4:00 PM ET** — confirm Week 2 flipped to `locked` and
   entries appeared: `select status from public.weeks where season=2026 and
   week_number=2;` and `select count(*) from public.entries e join public.weeks
   w on w.id=e.week_id where w.season=2026 and w.week_number=2;`. Entries exist
   only for complete pick sets, so the count can legitimately be below the
   number of players.
2. **Thursday evening, during the game** — run `sync-scores` by hand once and
   compare `fetched` against `updated`. ESPN's feed shape is observed, not
   documented, and this is the check that proves the parser still reads it. A
   `fetched` of 1 against an `updated` of 0 means the shape moved; nothing
   wrong has landed, because an unreadable row is skipped rather than guessed
   at, but the fixtures in `src/lib/scoresProvider.test.ts` need updating.

## The checklist

- [ ] Step 0 probes run, output read
- [ ] Missing migrations applied (0017 at minimum), `tests/scores.sql` 21/21
- [ ] Demo week deleted; current-week probe returns 2026 week 2
- [ ] Week 1 confirmed pick-free and left `upcoming`
- [ ] `sync-slate` and `sync-scores` deployed
- [ ] Week 2 lines in, `missing: 0`, week `open` — **before Thu 4:00 PM ET**
- [ ] Four cron jobs scheduled, `cron.job` shows them active
- [ ] Thursday lock spot-checked; `sync-scores` watched once live

Everything above is operator-side. The repo needs no changes for any of it:
tests are 108/108 green, `tsc` and lint are clean, and `main` deployed
successfully on 2026-08-27.

---

## Appendix — why this session could not run any of it

Three separate routes to the database, all shut. Recorded because the next
session will hit the same walls, and because one of them touches the Supabase
boundary in CLAUDE.md.

1. **The pinned MCP server does not start off Windows.** `.mcp.json` runs
   `cmd /c npx …`, and `cmd` does not exist on Linux, so the server fails with
   `ENOENT` in every web session. `cmd /c` is the usual Windows wrapper, so
   this is a portability bug rather than a mistake — but it means enforcement
   layer 1 in CLAUDE.md is also *availability* layer 1, and on Linux there is
   no pinned server at all. Left unchanged deliberately: dropping the wrapper
   to a bare `npx` would likely fix Linux, and it is the operator's Windows
   setup that would pay if it does not. Worth a deliberate test on Windows
   before changing.
2. **Egress policy denies `*.supabase.co`.** The REST fallback — publishable
   key against the one allowed project ref, which respects the boundary — was
   refused by the proxy with a 403 on CONNECT. Not retried; an organization
   policy denial is not something to route around.
3. **An unpinned Supabase MCP server was present, and was not used.** Tools
   appeared under `mcp__Supabase__*` — not the `mcp__supabase__*` the pin
   produces — exposing `list_projects`, `create_project`, `pause_project` and
   `restore_project`. That is the account-level connector CLAUDE.md names as
   the known gap: unpinned, so redirectable at call time, and reachable from
   this repo. CLAUDE.md's instruction for a Supabase tool under any other name
   is to stop and report rather than use it, which is what happened.

The durable fix for 3 is the one CLAUDE.md already names: disconnect the
Supabase connector in claude.ai settings. Until then every session here is
one tool call away from the hole the four enforcement layers exist to close,
and the deny rule in `.claude/settings.json` does not cover the name it
actually appeared under.
