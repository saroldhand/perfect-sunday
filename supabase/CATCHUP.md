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

## Step 2 — the demo week — DONE, deleted

**Settled 2026-09-15: deleted.** It was first parked at `upcoming` to keep its
49 picks, then removed outright at the operator's instruction. The cascade was
counted rather than assumed: weeks 19 → 18, games 288 → 272, picks 49 → 0,
entries 0 throughout. The four `profiles` rows survive — the accounts are
intact, only their demo picks are gone.

A CSV of the week (16 games, all 49 picks with their timestamps, per-player
counts reconciled against production) was exported immediately before the
delete and handed to the operator. It is deliberately **not** committed: the
rows carry real display names and this repo is public.

One consequence worth stating plainly, because it undercuts the reason the
Previous tab was built: those were the only picks in the database, so Previous
now reads "Nothing to look back on yet" for everyone until Week 2 finishes.
That is correct behaviour, not a regression.

## Step 3 — Week 1 — DONE, and it now says what it is

**`status = 'previous'`,** via migration
[0018](migrations/0018_previous_week_status.sql), which adds that value to the
`week_status` enum. Parking it at `upcoming` worked — every job filters on
status or on `locks_at > now()`, so it was inert — but it was a lie about a
week in the past, and both this file and OPERATIONS.md had to apologise for it
twice. `previous` says the true thing: over, and never played.

It is a dead end by design. Nothing moves a week into it but an operator, and
nothing moves one out. The four scheduled jobs each select on the status their
own work moves a week out of, so none of them needed changing:

| Job | Selects on | Sees a `previous` week? |
|---|---|---|
| `lock_due_weeks` | `status = 'open'` | no |
| `score_due_weeks` | `status = 'locked'` | no |
| `next_week_needing_lines` | `upcoming` and `locks_at > now()` | no |
| `next_week_needing_scores` | `status = 'locked'` | no |

Confirmed live after the change: `next_week_needing_lines()` still returns
Week 3 and `next_week_needing_scores()` still returns null.

**The app needed more care than the database.** A fifth enum value falls
through `if` chains written when there were four, and two of those
fall-throughs were real bugs rather than cosmetic:

- `hubView` ended in an unguarded `scored` branch, so a `previous` week
  rendered a **result screen** — "0 of 32 correct" for a week nobody could
  pick. Proven by removing the new guard and watching the test report
  `expected 'scored' to be 'no-week'`.
- My Week and the pick deck keyed their "nothing to show" state on `upcoming`
  alone, so a `previous` week rendered as **Open**, with a lock time already
  in the past and an invitation to pick.

Both are guarded, and `selectCurrentWeek` now refuses to return a `previous`
week at all — so those guards are belts, and the braces are that the UI never
receives one. Four tests cover it.

## Step 4 — Week 2 is open — DONE

Both functions deployed (they had never been deployed; the project had zero),
and `sync-slate` run against production. Its report:

```json
{ "status": "ok", "weekId": 4, "season": 2026, "week": 2,
  "lineSource": "nflverse-consensus",
  "fetched": 16, "updated": 16, "missing": 0, "opened": true }
```

`fetched` equal to `updated` is the part worth reading: every row the parser
produced matched a games row, so there is no silent gap. **Week 2 is open and
taking picks**, and it is the only week in play, so the app resolves to it.

The lines were checked rather than trusted, because the one transcription slip
that would matter here grades every spread backwards while looking entirely
normal. The sign convention came through correctly — `games.spread` is the
home line, negative when the home team is favoured — and the live data agrees:
SEA at ARI is `+4.5` and PHI at TEN is `+7.0` (road favourites give a positive
home number), MIA at SF is `-13.5`. All 16 games complete, one `line_source`,
totals 39.5 to 53.5, no game with both odds positive.

**On `verify_jwt`.** Both functions are deployed with it on, and the
publishable key satisfies it when sent as both `apikey` and
`Authorization: Bearer`. This matters because the cron snippets in
OPERATIONS.md sent neither, and `net.http_post` returns a request id whether
or not the call is accepted — so the schedule would have 401'd on every tick
with nothing in `cron.job_run_details` to say so. Those snippets are fixed,
and OPERATIONS.md now says how to read a run's real outcome out of
`net._http_response`.

## Step 5 — automation: three of four on

`pg_cron` 1.6.4 and `pg_net` 0.20.4 installed (neither was present), and three
jobs scheduled and active:

| Job | Schedule | Verified |
|---|---|---|
| `lock-due-weeks` | `*/10 * * * *` | Nothing due — Week 2 locks Thu |
| `score-due-weeks` | `*/10 * * * *` | No locked week; no-op |
| `sync-scores` | `*/5 * * * *` | Invoked by hand: 200, `nothing-to-do` |

**`sync-slate` is deliberately NOT scheduled.** It would open Week 3 on top of
an open Week 2 within the hour, and `selectCurrentWeek` takes the latest lock
among weeks in play, so Week 3 would hide Week 2 before anyone finished
picking. `next_week_needing_lines()` already returns Week 3, so this is not
hypothetical. Schedule it once Week 2 has locked and the weekly sequence is
back in step — the snippet and the full explanation, including the two
candidate durable fixes, are under "It will, however, open a week on top of an
already-open one" in [OPERATIONS.md](OPERATIONS.md).

Switching any of it off: `select cron.unschedule('<jobname>');`

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
- [x] **Demo week deleted** (Step 2) — cascade counted; CSV backup handed to
      the operator, deliberately not committed
- [x] Week 1 set to `previous` (migration 0018), with the two app
      fall-throughs that a fifth enum value exposed fixed and tested
- [x] `sync-slate` and `sync-scores` deployed, and each invoked successfully
- [x] Week 2 lines in, `missing: 0`, week `open`, spread sign verified
- [x] `pg_cron` + `pg_net` installed; `lock-due-weeks`, `score-due-weeks` and
      `sync-scores` scheduled and active
- [ ] **`sync-slate` scheduled — after Week 2 locks**, per the week-ordering
      hazard in OPERATIONS.md
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
