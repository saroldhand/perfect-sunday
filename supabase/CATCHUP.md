# Catching the database up after the pause

Written 2026-09-15, the Tuesday after Week 1 ended. One-time runbook, unlike
[OPERATIONS.md](OPERATIONS.md), which is the evergreen reference — every step
here exists because the Supabase project was paused across the season opener
and the database had fallen five migrations behind the repo. Delete this file
once the last box is ticked.

**Status 2026-09-15: Steps 0, 1 and 3 are done and verified against production.**
Migrations 0013-0017 were applied this session and checked; the remaining work
is Step 2 (a decision, see below), Step 4 and Step 5. The original preamble
said none of this could be verified, because the session that wrote it had no
route to the database. That was resolved mid-session, and what the probes found
was considerably worse than this document assumed — see **What was actually
wrong** below.

## What was actually wrong

The database was not nineteen days behind the repo. It was at **migration
0012** — five migrations back, not one:

| | Expected | Found |
|---|---|---|
| Migrations applied | 0001-0016 | **0001-0012 only** |
| Weeks in database | 18 (2026) + demo | **1** — the demo alone |
| Games | 272 + 16 | **16** — the demo alone |
| Edge Functions deployed | sync-slate | **none** |
| pg_cron / pg_net | available | **not installed** |

So the 2026 season was never loaded at all: Week 1 did not exist as a row, and
neither did Week 2. That is the real reason Week 1 never happened — not that a
job failed to fire, but that there was nothing for it to fire on.

**And four people had already signed up and played the demo week.** Not just
the operator: `Harry S`, `Baller` and `max` each have a complete 16-of-16 set
against the 2025 demo slate, and `EK` picked one game and stopped, between 21
and 26 August. That is real usage on a demo week, and it is why Step 2 below
changed from a cleanup into a decision.

### Applied this session, verified

- 0013 — `teams.stats_season`, all 32 clubs labelled `(2025, 18)`. This also
  silently fixed the live app: `getTeams` had been falling back past the
  missing column on every load, so the cards had no stat line at all.
- 0014 — `lock_due_weeks`, `score_due_weeks`.
- 0015 — 18 weeks and 272 games for 2026. Verified by digest rather than by
  eye: the `(week, external_id, away, home, kickoff)` tuples in the database
  md5 to `45de3f545329d5dd02249de935cb9ce8` under C collation, identical to
  the same digest computed from `0015_seed_2026_schedule.sql`, 272 rows both
  sides.
- 0016 — `apply_week_lines`, `next_week_needing_lines`, service-role wrappers.
- 0017 — `apply_week_scores`, `next_week_needing_scores`, service-role
  wrappers.

Step 3's claim that Week 1 is inert is now confirmed by the live functions
rather than argued from the source: `private.next_week_needing_lines()`
returns **4**, which is 2026 Week 2, skipping Week 1 (id 3) on its own.
`private.next_week_needing_scores()` returns null.

## Where the clock actually is

| | |
|---|---|
| Week 1 locked | Wed 9 Sep, 7:50 PM ET — past (week id 3, no lines, no picks) |
| Week 1 finished | Mon 14 Sep, 8:15 PM ET — all 16 games done |
| Demo week locked | Thu 10 Sep, 4:00 PM ET — **past, and still `open`** |
| **Week 2 locks** | **Thu 17 Sep, 4:00 PM ET** (week id 4) |
| Week 2 first kickoff | Thu 17 Sep, 8:15 PM ET |

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

## Step 1 — apply whatever Step 0 says is missing — DONE

0013 through 0017 were applied this session, in order, and verified above.
Nothing is outstanding.

The suites in `tests/` were **not** run — each is `begin; … rollback;` so they
are safe to run against production, but they seed their own fixture weeks and
the session that applied the migrations left them for the operator. Worth doing
once, in the SQL editor:
[tests/scores.sql](tests/scores.sql) (expect 21 of 21 PASS),
[tests/lines.sql](tests/lines.sql), [tests/jobs.sql](tests/jobs.sql).

## Step 2 — the demo week — DONE, kept rather than deleted

**Settled 2026-09-15: `status = 'upcoming'`.** The operator's call, and the
right one — the week held **49 picks from 4 real accounts** (complete 16-of-16
sets for `Harry S`, `Baller` and `max`; `EK` picked one game), so deleting it,
which is what this runbook first recommended, would have destroyed the only
real usage data the product has.

```sql
update public.weeks set status = 'upcoming'
where season = 2025 and week_number = 18;
```

What that buys, all verified against production:

- The picks are intact — 49, unchanged.
- It is inert everywhere. Every job filters on status or on `locks_at > now()`,
  so `lock_due_weeks` will not lock it once cron is on, `sync-slate` will not
  refill it, and `sync-scores` will not fetch it. Same state Week 1 sits in.
- It is off the live app: `selectCurrentWeek` only considers `open` or
  `locked` weeks first, then upcoming weeks whose lock is still ahead.
- The board stays clean, which `scored` would not have — `getLastScoredWeek`
  orders by season descending, so a scored 2025 week would have become the
  board's "most recent finished week" with no entries behind it.

The one cost of keeping it was that those 49 picks had nowhere to be seen, so
the same change added a place: **a Previous tab** (`/history`), listing every
week already gone by that you have picks in, newest first, with the same rows
and grade chips My Week uses. It keys off the clock — `locks_at <= now` —
rather than off `scored`, which is what lets it show this demo week at all,
and what will stop it hiding a real week halfway through being graded.

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

- [x] Step 0 probes run, output read
- [x] Migrations applied — 0013, 0014, 0015, 0016, 0017; 0015 digest-verified
- [ ] `tests/scores.sql` run in the SQL editor (21 of 21 PASS)
- [x] **Demo week decided** (Step 2) — set to `upcoming`; 49 picks kept, and
      a Previous tab added so they can be looked at
- [x] Week 1 confirmed pick-free and left `upcoming`; live functions skip it
- [ ] `sync-slate` and `sync-scores` deployed
- [ ] Week 2 lines in, `missing: 0`, week `open` — **before Thu 4:00 PM ET**
- [ ] `pg_cron` + `pg_net` installed, four cron jobs scheduled and active
- [ ] Thursday lock spot-checked; `sync-scores` watched once live

The repo itself needs no changes for any of it: tests are 108/108 green, `tsc`
and lint are clean, and `main` deployed successfully on 2026-08-27.

## Appendix — the route to the database, and the boundary

Three routes, two shut and one that should not exist. Recorded because the next
session will hit the same walls, and because the third touches the Supabase
boundary in CLAUDE.md.

1. **The pinned MCP server does not start off Windows.** `.mcp.json` runs
   `cmd /c npx …`, and `cmd` does not exist on Linux, so the server fails with
   `ENOENT` in every web session. `cmd /c` is the usual Windows wrapper, so
   this is a portability bug rather than a mistake — but it means enforcement
   layer 1 in CLAUDE.md is also *availability* layer 1, and on Linux there is
   no pinned server at all. Left unchanged deliberately: dropping the wrapper
   to a bare `npx` would likely fix Linux, and it is the operator's Windows
   setup that would pay if it does not. Worth a deliberate test on Windows.
2. **Egress policy denies `*.supabase.co`.** The REST fallback — publishable
   key against the one allowed project ref, which respects the boundary — was
   refused by the proxy with a 403 on CONNECT. Not retried; an organization
   policy denial is not something to route around.
3. **An unpinned Supabase MCP server was present**, under `mcp__Supabase__*`
   rather than the `mcp__supabase__*` the pin produces, exposing
   `list_projects`, `create_project`, `pause_project` and `restore_project`.
   That is the account-level connector CLAUDE.md names as the known gap:
   unpinned, so redirectable at call time, and reachable from this repo.
   Per CLAUDE.md it was reported and not used — and then the operator
   **explicitly authorised it for that one session**, which is how the
   migrations above came to be applied. Every call carried
   `project_id: vockiqvlijtkxvpdttya` and no project was ever enumerated.

That authorisation was for one session and does not carry forward. The durable
fix is still the one CLAUDE.md names: disconnect the Supabase connector in
claude.ai settings, and note that the deny rule in `.claude/settings.json`
does not cover the name it actually appeared under (`mcp__Supabase__*`, capital
S) — worth adding whichever way the connector question is settled.
