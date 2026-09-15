# Running a week by hand

> **2026-09-15 — the database is behind the repo.** The project was paused
> across the Week 1 opener, so nothing here has been run against production
> yet. Work [CATCHUP.md](CATCHUP.md) first; it is the one-time runbook that
> gets the database to a live Week 2. One correction it carries: the demo-week
> cutover below says mark it `scored`, which was right before the season
> started and is wrong now — delete it instead, and CATCHUP.md Step 2 says why.

The operator runs three steps from the Supabase SQL editor. All three can now be
automated instead — `sync-slate` opens a week once its lines land, and `pg_cron`
can run the lock and grade jobs — but **nothing is scheduled by default**, so
until you switch it on, the steps below are how a week runs.

Entering final scores is no longer the manual exception: `sync-scores`
fetches results live and grades as games finish — see [sync-scores: pulling
the results](#sync-scores-pulling-the-results). Typing box scores (step 3)
remains as the fallback, and as the only path for a correction or a
postponed game.

Every function below lives in the `private` schema, which PostgREST does not
expose. There is no REST endpoint for them, so a signed-in user cannot reach
them.

## Migrations are applied by hand, and the frontend is not

`.github/workflows/deploy.yml` builds and publishes the site on every push to
`main`. It does **not** run migrations — nothing does. The database moves only
when someone runs a migration in the Supabase SQL editor.

So the two halves deploy independently, and the frontend always wins the race.
Merging a branch whose code selects a column that its migration has not yet
added puts a build in production that queries a database which cannot answer.

This has already happened once. Migration 0013 added `teams.stats_season` and
the same branch taught `getTeams` to select it. The branch merged, CI deployed,
the migration had not been run, and PostgREST rejected the read with SQLSTATE
42703. Because `WeekProvider` wraps every tabbed screen and treats a failed
read as fatal, one decorative column blanked the whole app.

Two rules, then:

1. **Apply the migration before merging** the code that depends on it. Additive
   migrations — a new nullable column, a new table — are safe to apply early
   against the running site precisely because the old build does not know they
   exist.
2. **Let the client tolerate a column it cannot get**, wherever the data is not
   load-bearing. `getTeams` now retries without the stat columns on 42703, so a
   stat line goes missing instead of the product. That belt is not a licence to
   skip rule 1; it only bounds the blast radius when rule 1 is missed.

To check which migrations a database has, compare the files in `migrations/`
against the schema itself — there is no migrations table:

```sql
-- 0013 applied?
select count(*) from information_schema.columns
where table_schema = 'public' and table_name = 'teams'
  and column_name = 'stats_season';
```

## Naming the week

Every statement below identifies the week by `(season, week_number)` and never
by a literal `weeks.id`.

`weeks.id` is `generated always as identity`, so it is whatever the sequence
handed out — it is not stably 1, and re-seeding a week keeps the row's original
id rather than resetting it. A statement filtered on a guessed id does not
error; it matches nothing and reports success, which is the worst way for an
operator step to fail. Substitute the season and week number, not an id.

## The season is preloaded; the lines are not

Migration 0015 seeds the whole 2026 regular season — 18 weeks, 272 games — with
matchups, kickoff times and computed lock times, and with `total`, `over_odds`,
`under_odds`, `moneyline_home`, `moneyline_away` and `line_source` all NULL.
(0015 seeded a `spread` column too; migration 0019 replaced it with the
moneyline pair — see that migration's header for why.) Schedules are published
months ahead; lines are not. Loading what is known early leaves only the numbers
to fill in weekly.

Every week is seeded `upcoming`. **A week must not be opened until every game on
its slate has a complete line** — that is SPEC §5's rule, and it is what stops
anyone picking against a number that is not really there.

Three weeks lock earlier than the usual Thursday 4:00 PM ET, because their slate
opens before it:

| Week | Opens | Locks |
|---|---|---|
| 1 | Wed 9 Sep, 8:20 PM ET — season opener | Wed 9 Sep, 7:50 PM ET |
| 12 | Wed 25 Nov, 8:00 PM ET — Thanksgiving week | Wed 25 Nov, 7:30 PM ET |
| 18 | Sun 10 Jan, 1:00 PM ET — no Thursday game | Sun 10 Jan, 12:30 PM ET |

The lock time is always shown to the user rather than assumed, so an early lock
never surprises anyone — but it does mean **Week 1 closes on a Wednesday**.

### Filling in a week's lines by hand

`sync-slate` does this automatically — see [sync-slate: pulling the
lines](#sync-slate-pulling-the-lines). This is the manual fallback, for a
correction or when the feed is short.

```sql
update public.games g set
  moneyline_home = v.moneyline_home, moneyline_away = v.moneyline_away,
  total = v.total,
  over_odds = v.over_odds, under_odds = v.under_odds,
  line_source = 'hand-entered'
from (values
  ('2026-01-NE-SEA',  -150,  130, 44.5, -110, -110),
  ('2026-01-DAL-PHI',   120, -142, 47.5, -105, -115)
  -- ...one row per game on the slate
) as v (external_id, moneyline_home, moneyline_away, total, over_odds, under_odds)
where g.external_id = v.external_id;
```

Both moneyline columns or neither. A game priced on one side only counts as
missing, so a half-filled row keeps the week shut rather than opening it onto a
card with one real number and one dash.

`external_id` is `{season}-{week}-{away}-{home}`, e.g. `2026-01-NE-SEA`, and is
unique across the season, so this needs no week filter.

Set `line_source` to where the numbers actually came from. `sync-slate` writes
`nflverse-consensus`, because that is what nflverse publishes — a consensus
market number it attributes to no book. If you type numbers in by hand, say so
rather than borrowing a book's name: grading an entry against a line the user
never saw is the worst failure this product has, and a wrong provenance label
is how that happens quietly.

### Check the slate is complete before opening

```sql
select w.week_number,
       count(*) as games,
       count(*) filter (
         where not private.line_complete(g.moneyline_home, g.moneyline_away, g.total)
       ) as missing
from public.games g
join public.weeks w on w.id = g.week_id
where w.season = 2026
group by w.week_number
order by w.week_number;
```

Open the week only when `missing` is 0. Step 1 below is that step.

### The demo week is gone

The 2025 Week 18 demo week was deleted on 2026-09-15. Nothing in this document
needs it any more, and the cutover instructions that used to sit here — mark it
`scored`, or delete it — are retired along with it. If a demo week is ever
seeded again (migration 0005), delete it rather than marking it `scored`:
`getLastScoredWeek` orders by season descending, so a scored week from an old
season becomes the board's "most recent finished week" until a real one is
scored.

### `previous`: a week that was never played

Migration 0018 adds a fifth `week_status`. It exists for 2026 Week 1, which
went by while the project was paused — no lines, no picks, nothing graded — and
for which none of the other four statuses was true. `upcoming` was the least
wrong option and was used for a few hours; it is still a lie about a week in
the past.

```sql
update public.weeks set status = 'previous'
where season = 2026 and week_number = 1;
```

It is terminal: an operator puts a week there, and nothing takes it out. No
scheduled job can see it, because each selects on the status its own work
moves a week out of — so there was nothing to change in any of them. The app
skips it too: `selectCurrentWeek` will not return a `previous` week, which is
what stops an empty slate reaching the screen.

Use it for a week that is over and was not played. Do **not** use it to retire
a week that *was* played — that is what `scored` is for, and a played week's
result belongs on the board.

## 1. Open the week## 1. Open the week

Picks are writable only while `weeks.status = 'open'` — that is enforced by RLS,
not by the UI.

```sql
-- Only once the slate check above reports missing = 0.
update public.weeks set status = 'open'
where season = 2026 and week_number = 1;
```

## 2. Lock it

Run this at the posted lock time. It freezes the week and creates entry rows
**only for users with a complete set of picks**. Someone who picked twelve of
sixteen games gets no entry, is not scored, and does not appear on the
leaderboard — their pick rows stay for their own history.

```sql
select private.lock_week(
  (select id from public.weeks where season = 2026 and week_number = 1)
);
```

Returns the number of entries created.

Nothing recreates a missing entry later. If someone should have been included
and was not, fix their picks and re-run `lock_week` — it is safe to repeat.

## 3. Enter scores and grade

`sync-scores` does this automatically as games finish — see [sync-scores:
pulling the results](#sync-scores-pulling-the-results). This is the manual
fallback, for a correction, a postponed game, or when the feed is short.
`set_final_score` has no final-is-final guard, which is deliberate: it is how
the operator overrules a number, including one the feed already wrote.

One call per finished game, then one call to grade. `set_final_score` takes the
`external_id` from the slate rather than the row uuid, so scores can be typed
from a box score.

```sql
-- external_ids are '{season}-{week}-AWAY-HOME', e.g. '2026-01-NE-SEA'.
-- One row per finished game. The numbers below are placeholders — replace them
-- with the real box score.
with wk as (
  select id from public.weeks where season = 2026 and week_number = 1
)
select private.set_final_score(wk.id, v.external_id, v.home_score, v.away_score)
from wk
cross join (values
  ('2026-01-NE-SEA',  17, 24),
  ('2026-01-DAL-PHI', 20, 13)
  -- ...
) as v (external_id, home_score, away_score);

select * from private.score_week(
  (select id from public.weeks where season = 2026 and week_number = 1)
);
```

`score_week` grades every game currently marked final, recomputes each entry's
`correct_count` / `is_alive` / `is_complete`, and — once every game in the week
is final — sets `is_perfect` and flips the week to `scored`.

Run it as often as you like. Grading is a pure function of pick and result, and
entry totals are recomputed by aggregate rather than incremented, so re-running
over already-final games changes nothing. That is verified in
[tests/scoring.sql](tests/scoring.sql).

### Scoring rules it applies

| Situation | Result |
|---|---|
| Combined score beat the total | over correct |
| Combined score fell short of the total | under correct |
| Combined score landed exactly on the total | correct for **both** sides |
| Picked team won outright | moneyline correct |
| Game ended in a tie | moneyline correct for **both** sides |
| Pick left blank | stays ungraded, never counted correct |

Half-point totals make a landed number rare, but whole numbers do occur and the
generous reading avoids arguments. A tie is the moneyline's only push.

The last row is load-bearing on the moneyline layer, and it is checked before
the tie rule rather than after. Migration 0006 had those two arms the other way
round, so a drawn game marked an unmade pick correct — see
`supabase/tests/scoring.sql`, which asserts it.

Note what is *not* in this table: the prices. A favourite losing is a wrong
pick like any other, and `score_week` reads neither `moneyline_home` nor
`moneyline_away`. The odds are there for the card to print, nothing more.

## 4. Check for a winner

Winner detection is a flag, never an automatic payout.

```sql
select p.display_name, e.correct_count, e.picks_possible
from public.entries e
join public.profiles p on p.id = e.user_id
join public.weeks w on w.id = e.week_id
where w.season = 2026 and w.week_number = 1 and e.is_perfect;
```

If this ever returns a row, handle the prize manually. Multiple winners split
the posted prize evenly — that is stated in the Official Rules and is what caps
liability at exactly the posted amount regardless of entry volume.

## Refreshing team stats

Migration 0013 seeds every club's **2025 final** record and scoring averages,
and the card labels them as such — "2025 final" sits in the card's eyebrow, so
a 14-3 beside a Week 1 matchup is never mistaken for this year's form.

That label is driven by data, not by a hardcoded string. From Week 2 onward,
overwrite the rows with current-season numbers and move `stats_season` and
`updated_through_week` with them; the card starts reading "2026 thru wk 2" on
its own.

```sql
update public.teams t set
  wins = v.wins, losses = v.losses, ties = v.ties,
  ppg = v.ppg, papg = v.papg,
  stats_season = 2026, updated_through_week = 2
from (values
  ('BUF', 2, 0, 0, 27.5, 17.0),
  ('MIA', 1, 1, 0, 20.0, 21.5)
  -- ...one row per club
) as v (abbr, wins, losses, ties, ppg, papg)
where t.abbr = v.abbr;
```

Both columns must move together. The card shows no numbers at all unless
`stats_season` and `updated_through_week` are both set, which is deliberate:
an unlabelled record is worse than a sparse card, because the reader supplies
the wrong season themselves. Phase 2's `sync-slate` takes this step over.

## sync-slate: pulling the lines

`supabase/functions/sync-slate` fetches a week's lines and applies them. It is
the only one of the three Phase 2 jobs that is an Edge Function, because it is
the only one that makes an outbound call.

**Where the lines come from, stated plainly.** The provider is nflverse's
published market data. Those are a **consensus line, not a named sportsbook** —
nflverse does not attribute them to one, so `line_source` is written as
`nflverse-consensus` rather than `fanduel`. If the game is ever advertised as
using FanDuel numbers, the provider has to change first; relabelling alone would
be grading people against a line they were never shown.

No major book publishes a public odds API. Switching to a named book means an
aggregator that carries one — SPEC's working assumption is The Odds API with a
`bookmakers=fanduel` filter — and that is one new `OddsProvider` in
`supabase/functions/_shared/oddsProvider.ts` plus the constant `sync-slate`
constructs. Nothing else moves.

### Deploying and running it

```bash
supabase functions deploy sync-slate
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime;
there is nothing to configure. Run it by hand:

```bash
# the earliest not-yet-locked week still missing lines
curl -X POST "https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-slate" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# or a specific week
curl -X POST "https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-slate" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" -d '{"weekId": 12}'
```

It reports `updated`, `missing` and `opened`. `opened: true` means the slate was
complete and the week is now taking picks. `missing` above zero means it is not,
and the week stays shut — which is the intended outcome, not a failure.

### Scheduling it

Not scheduled by default, same as the other two. SPEC §5 wants it hourly from
Tuesday until the slate is complete; hourly year-round is simpler and costs
nothing, since it returns `nothing-to-do` when no week needs lines.

```sql
select cron.schedule('sync-slate', '0 * * * *', $$
  select net.http_post(
    url := 'https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-slate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_VrGb2daesMaOAJfIpCqLzg_eR-8JMcb',
      'Authorization', 'Bearer sb_publishable_VrGb2daesMaOAJfIpCqLzg_eR-8JMcb'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

**The key headers are not optional.** Both functions are deployed with
`verify_jwt` on, so a post without them is rejected before the function runs —
an earlier version of this snippet sent only `Content-Type` and would have
failed every tick silently, since `net.http_post` returns a request id
whether or not the call succeeds. The publishable key is the right one to use
here: it already ships in the browser bundle, so putting it in a cron
definition leaks nothing, and it keeps the service-role key out of the
automation exactly as migration 0014 intended.

This needs `pg_net` as well as `pg_cron`. Unschedule with
`select cron.unschedule('sync-slate');`.

### What it will not do

- Touch a locked or scored week. Its numbers are what entries were graded
  against, and `apply_week_lines` refuses them outright.
- Open a week with any game missing a line.
- Write a partial line. A game missing any of the two moneylines, the total, or
  the over/under odds is skipped entirely, leaving the columns NULL so the week
  stays shut.

### It will, however, open a week on top of an already-open one

`next_week_needing_lines()` selects on `status = 'upcoming'`, so the moment a
week opens it stops being a candidate and the *next* one becomes one. In the
normal weekly rhythm that is exactly right and never collides: a week is
`scored` by Monday night, and the next week's lines land on Tuesday, so only
one week is ever in play.

Out of cadence it collides, and the collision is not benign.
`selectCurrentWeek` prefers weeks that are `open` or `locked` and, among them,
takes the **latest** `locks_at` — so a newly opened week hides the one before
it. If Week N is open and taking picks, and Week N+1's lines land and open it,
the app jumps to Week N+1 and nobody can finish their Week N picks.

This is live right now: Week 2 opened out of cadence on Tue 15 Sep, and
`next_week_needing_lines()` already returns Week 3. **That is why `sync-slate`
is deliberately the one job not scheduled.** Schedule it once Week 2 has
locked and the sequence is back in step:

```sql
-- After Week 2 locks. The snippet is under "Scheduling it" above.
select cron.schedule('sync-slate', '0 * * * *', $$ ... $$);
```

The durable fix is a product decision rather than a patch, which is why this
session did not make it. Either `next_week_needing_lines` should decline to
open a week while an earlier one is still `open`, or `selectCurrentWeek`
should prefer the *earliest* week in play — which is arguably what its own
comment already describes ("between Thursday's lock and the last game going
final, the week the user cares about is the one they are already in"), and
which would also show a locked Week N rather than an open Week N+1 during
Sunday's games. The cost of earliest-first is that one week left `locked`
because a game never went final would pin the app there, which is the case
the current "latest" rule was written for.

## sync-scores: pulling the results

`supabase/functions/sync-scores` fetches the locked week's scores and grades
whatever has gone final, in the same call. It is what makes a pick flip green
within a minute or two of a game ending — any day the schedule puts a game on
— instead of waiting for box scores to be typed in.

**Where the scores come from.** ESPN's public scoreboard feed, the one their
own site runs on. It updates live, which nflverse (the lines source) does not
— its CSV publishes on a lag of hours, useless for the Sunday sweat. The feed
is unofficial-but-ubiquitous rather than documented, so every assumption
about its shape is pinned in `src/lib/scoresProvider.test.ts`, and the
function reports `fetched` beside `updated` so a shape drift shows as a
visible gap, never a silent miss. Swapping providers is one new
`ScoresProvider` in `supabase/functions/_shared/scoresProvider.ts`, exactly
as on the odds side.

What one run does, all through `private.apply_week_scores` (0017, covered by
[tests/scores.sql](tests/scores.sql)):

- writes live scores to games in progress — My Week shows them as they move;
- marks finished games `final` with their box score;
- grades everything standing final through the same idempotent `score_week`
  the cron backstop uses, so entries move in the same call;
- flips the week to `scored` when the last game is in.

### Deploying and running it

```bash
supabase functions deploy sync-scores
```

Run it by hand:

```bash
# the earliest locked week with a started slate and an unfinished game
curl -X POST "https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-scores" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# or a specific week
curl -X POST "https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-scores" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" -d '{"weekId": 12}'
```

**Watch its first game day by hand.** The feed's shape is observed, not
promised. During the first live window, run it once and read the report:
`fetched` should match the number of games under way or final, and `updated`
should track it. A `fetched` of 16 against an `updated` of 0 means the feed
moved and the parser's fixtures need updating — either way nothing wrong has
landed in the database, because a row the parser cannot read is skipped, not
guessed at.

### Scheduling it

Every five minutes, year-round. When no locked week has a started, unfinished
game it answers `nothing-to-do` from one indexed query without fetching
anything — so the idle cost is nothing, and there is no game-window calendar
to maintain or get wrong on a Thursday, a Saturday, or Christmas morning.

```sql
select cron.schedule('sync-scores', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://vockiqvlijtkxvpdttya.supabase.co/functions/v1/sync-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_VrGb2daesMaOAJfIpCqLzg_eR-8JMcb',
      'Authorization', 'Bearer sb_publishable_VrGb2daesMaOAJfIpCqLzg_eR-8JMcb'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

The key headers are required here too — see the note under sync-slate's
schedule. This job is already scheduled and running.

Same requirements as sync-slate: `pg_cron` and `pg_net`. Keep
`score-due-weeks` scheduled as well — grading rides inside
`apply_week_scores`, but the 0014 sweep is the backstop if a run ever dies
between the write and the grade.

### What it will not do

- Touch a week that is not `locked`. An open week's games have not started,
  and a scored week's results are published — a feed never rewrites them.
- Rewrite a game already marked `final`. Its grades may be on someone's
  screen; a stat correction that flips them is the operator's deliberate
  call, through `set_final_score` in step 3, never a feed hiccup's.
- Write a postponed or abandoned game. The feed reports both as ended without
  completion; they are left untouched, and what the game counts as is the
  operator's decision.

## Putting steps 2 and 3 on a timer

Migration 0014 adds two wrappers that pick their own weeks, so they can be run
by a scheduler with no argument:

- `private.lock_due_weeks()` — locks every `open` week whose `locks_at` has
  passed. Selecting on the clock rather than trusting the job to fire at
  exactly 4:00 means a missed or delayed tick still locks the week on the next
  one, late but correct.
- `private.score_due_weeks()` — grades every `locked` week. A week leaves this
  job the moment `score_week` flips it to `scored`, so a published result is
  never rewritten by a later tick.

Both are idempotent, and `supabase/tests/jobs.sql` asserts it — including the
two mistakes that only show up after a week on a timer: locking a week that was
not due, and re-writing one already scored.

### Why these are not Edge Functions

SPEC §5 files all three Phase 2 jobs as Edge Functions. That is right for
`sync-slate`, which calls an odds aggregator over HTTPS. It is wrong for these
two: they are pure SQL over tables in this database and call nothing outside
it. An Edge Function would add an HTTP hop, a service-role key sitting in a
function secret, and a deploy step, all to reach a function already living in
the database `pg_cron` runs in.

Only the two fetchers — `sync-slate` for lines and `sync-scores` for results
— need to be Edge Functions, and both exist.

### Switching it on

**Nothing is scheduled by default.** 0014 creates the functions and stops
there, because turning automation on changes what the database does while
nobody is watching, and the demo week is still driven by hand.

When you do want it, in the Supabase SQL editor:

```sql
create extension if not exists pg_cron;

-- Every ten minutes. lock_due_weeks is cheap when nothing is due — one indexed
-- scan of a table with one row per week — so a frequent tick costs nothing and
-- bounds how late a lock can be.
select cron.schedule('lock-due-weeks', '*/10 * * * *',
  $$select private.lock_due_weeks()$$);

-- SPEC §5 asks for every ten minutes from first kickoff through Monday night.
-- Running it year-round is simpler and just as cheap: with no locked week it
-- returns zero rows.
select cron.schedule('score-due-weeks', '*/10 * * * *',
  $$select private.score_due_weeks()$$);
```

`cron.schedule` runs in UTC. Neither job needs a wall-clock time, which is the
point of selecting by status and `locks_at` — there is no Eastern offset to get
wrong here, and no DST shift to track.

### Reading what a scheduled run actually did

`net.http_post` hands back a request id immediately and never fails on the
function's behalf, so a job showing `succeeded` in `cron.job_run_details`
means the post was *sent*, not that the function worked. The response is the
thing to read:

```sql
select r.id, r.status_code, r.error_msg, r.content
from net._http_response r
order by r.id desc
limit 10;
```

A 401 there means the key headers above are missing from the schedule.

To check and to switch off:

```sql
select jobname, schedule, active from cron.job;
select cron.unschedule('lock-due-weeks');
select cron.unschedule('score-due-weeks');
```

`score_due_weeks` grades whatever stands final, however it got there. With
`sync-scores` scheduled, games mark themselves final and grading rides in the
same call — this sweep stays on as the backstop, and as the path for scores
entered by hand.

## Resetting the demo

Aimed at the 2025 Week 18 demo week specifically — substitute the season and
week number to rewind a real one.

To replay the demo week from scratch:

```sql
update public.picks p set total_correct = null, moneyline_correct = null
from public.games g, public.weeks w
where p.game_id = g.id and g.week_id = w.id
  and w.season = 2025 and w.week_number = 18;

delete from public.entries
where week_id = (select id from public.weeks
                 where season = 2025 and week_number = 18);

update public.games set home_score = null, away_score = null, status = 'scheduled'
where week_id = (select id from public.weeks
                 where season = 2025 and week_number = 18);

update public.weeks set status = 'open'
where season = 2025 and week_number = 18;
```

This keeps everyone's picks and rewinds everything else.

The first statement is scoped to the week through `games`. An unscoped
`update public.picks set total_correct = null` would clear the grades on every
week ever played, which is invisible while one week exists and destructive the
moment a second one does.
