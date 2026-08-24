# Running a week by hand

The operator runs three steps from the Supabase SQL editor. Steps 2 and 3 can
now be handed to `pg_cron` instead — see [Putting steps 2 and 3 on a
timer](#putting-steps-2-and-3-on-a-timer) — but nothing is scheduled by
default, and step 1 and entering final scores stay manual until `sync-slate`
exists.

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
matchups, kickoff times and computed lock times, and with `spread`, `total`,
`over_odds`, `under_odds` and `line_source` all NULL. Schedules are published
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

### Filling in a week's lines

```sql
update public.games g set
  spread = v.spread, total = v.total,
  over_odds = v.over_odds, under_odds = v.under_odds,
  line_source = 'fanduel'
from (values
  ('2026-01-NE-SEA',  -3.5, 44.5, -110, -110),
  ('2026-01-DAL-PHI',  2.5, 47.5, -105, -115)
  -- ...one row per game on the slate
) as v (external_id, spread, total, over_odds, under_odds)
where g.external_id = v.external_id;
```

`external_id` is `{season}-{week}-{away}-{home}`, e.g. `2026-01-NE-SEA`, and is
unique across the season, so this needs no week filter.

Set `line_source` to the book the numbers actually came from. If they did not
come from FanDuel, say so — grading an entry against a line the user never saw
is the worst failure this product has, and a wrong provenance label is how that
happens quietly.

### Check the slate is complete before opening

```sql
select w.week_number,
       count(*) as games,
       count(*) filter (where g.spread is null or g.total is null) as missing
from public.games g
join public.weeks w on w.id = g.week_id
where w.season = 2026
group by w.week_number
order by w.week_number;
```

Open the week only when `missing` is 0. Step 1 below is that step.

### Cutting over from the demo week

The 2025 Week 18 demo week is still in the database and still `open`, and an
open week wins over every upcoming one — so until it is closed, the app shows
the demo rather than the real season. Before Week 1:

```sql
update public.weeks set status = 'scored'
where season = 2025 and week_number = 18;
```

`scored` rather than deleted keeps the demo picks and entries as history and
keeps the leaderboard's "last scored week" fallback with something to show. To
remove it outright instead, `delete from public.weeks where season = 2025 and
week_number = 18;` cascades to its games, picks and entries.

## 1. Open the week

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
| Picked team covered | spread correct |
| Spread landed exactly on the number | spread correct for **both** sides |
| Pick left blank | stays ungraded, never counted correct |

Half-point lines make a landed number rare on either layer, but whole numbers
do occur and the generous reading avoids arguments.

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

Only `sync-slate` needs to be an Edge Function, and it is not built yet — it
waits on the aggregator decision in SPEC's open decisions.

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

To check and to switch off:

```sql
select jobname, schedule, active from cron.job;
select cron.unschedule('lock-due-weeks');
select cron.unschedule('score-due-weeks');
```

Entering final scores stays manual until `sync-slate` exists: `score_due_weeks`
grades whatever `set_final_score` has marked final, and nothing yet marks games
final on its own.

## Resetting the demo

Aimed at the 2025 Week 18 demo week specifically — substitute the season and
week number to rewind a real one.

To replay the demo week from scratch:

```sql
update public.picks p set total_correct = null, spread_correct = null
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
