# Running a week by hand

Phase 1 has no scheduled jobs. The operator runs three steps from the Supabase
SQL editor. Phase 2's Edge Functions will call the same three functions on a
timer — the logic does not change, only what triggers it.

All three live in the `private` schema, which PostgREST does not expose. There
is no REST endpoint for them, so a signed-in user cannot reach them.

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

## 1. Open the week

Picks are writable only while `weeks.status = 'open'` — that is enforced by RLS,
not by the UI.

```sql
update public.weeks set status = 'open'
where season = 2025 and week_number = 18;
```

## 2. Lock it

Run this at the posted lock time. It freezes the week and creates entry rows
**only for users with a complete set of picks**. Someone who picked twelve of
sixteen games gets no entry, is not scored, and does not appear on the
leaderboard — their pick rows stay for their own history.

```sql
select private.lock_week(
  (select id from public.weeks where season = 2025 and week_number = 18)
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
-- Week 18 demo slate: external_ids are '2025-18-AWAY-HOME'.
-- One row per finished game. The numbers below are placeholders — replace them
-- with the real box score.
with wk as (
  select id from public.weeks where season = 2025 and week_number = 18
)
select private.set_final_score(wk.id, v.external_id, v.home_score, v.away_score)
from wk
cross join (values
  ('2025-18-CAR-TB', 17, 24),
  ('2025-18-SEA-SF', 20, 13)
  -- ...
) as v (external_id, home_score, away_score);

select * from private.score_week(
  (select id from public.weeks where season = 2025 and week_number = 18)
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
where w.season = 2025 and w.week_number = 18 and e.is_perfect;
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

## Resetting the demo

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
