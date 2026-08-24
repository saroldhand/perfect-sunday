# Running a week by hand

Phase 1 has no scheduled jobs. The operator runs three steps from the Supabase
SQL editor. Phase 2's Edge Functions will call the same three functions on a
timer — the logic does not change, only what triggers it.

All three live in the `private` schema, which PostgREST does not expose. There
is no REST endpoint for them, so a signed-in user cannot reach them.

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
