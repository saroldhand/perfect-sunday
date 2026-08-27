# Database tests

Five suites. `rls.sql` asserts the deny case for every policy that guards user data. It is
the difference between "RLS is enabled" and "RLS works".

Run it against the project database. Statements marked **Expect ERROR 42501**
are supposed to fail, so a client that halts on the first error will stop
there. Each test is its own transaction for that reason — run them
individually, or through a harness that records the error and continues.

Results as of 2026-08-23, all 12 passing:

| Test | Asserts | Result |
|---|---|---|
| 1 | Owner can write their own pick while the week is open | PASS |
| 2 | Another signed-in user sees 0 of those picks before lock | PASS |
| 3 | A signed-out visitor sees 0 picks before lock | PASS |
| 4 | Owner sees exactly their own picks | PASS |
| 5 | A user cannot write a pick under another user id | PASS — 42501 |
| 6 | A user cannot mark their own pick correct | PASS — 42501 |
| 7 | Autosave still works after the column revoke in test 6 | PASS |
| 8 | After lock, picks become readable by other users | PASS |
| 9 | After lock, the owner can no longer edit | PASS — 0 rows |
| 10 | After lock, the owner cannot add a new pick | PASS — 42501 |
| 11 | A signed-out visitor cannot read `terms_accepted_at` from a profile | PASS — 42501 |
| 12 | A signed-out visitor can read display names for the public board | PASS |

Test 7 exists because the fix for test 6 — revoking UPDATE on `picks` and
re-granting only `total_pick` and `spread_pick` — is exactly the kind of
change that silently breaks the write path it is meant to narrow.

Test 9 counts affected rows through a CTE rather than reading RETURNING output.
A blocked UPDATE returns no rows, which looks identical to a statement that ran
and matched nothing.

Tests 11 and 12 are a pair. The public leaderboard needs anon to read display
names, and 0012 grants exactly three columns to do it. Test 11 proves the
column grant is load-bearing; test 12 proves it did not overshoot and blank
the board.

## scoring.sql

Asserts the grading rules and the guarantees around them. Unlike `rls.sql` it
runs as one transaction ending in ROLLBACK, on a fixture week numbered 998, so
it is safe to run against the live project — it cannot touch a real week.

Results as of 2026-08-21, all 11 passing:

| Asserts | Result |
|---|---|
| `lock_week` creates entries only for complete sets | PASS |
| An incomplete picker never gets an entry | PASS |
| A combined score landing exactly on the total counts for both sides | PASS |
| A total otherwise grades over/under normally | PASS |
| A spread landing exactly on the number counts for every side | PASS |
| A perfect entry reads 6/6, alive, perfect | PASS |
| A busted entry is not alive and not perfect | PASS |
| The week flips to `scored` once every game is final | PASS |
| Three consecutive runs change no count | PASS |
| Three consecutive runs create no extra entries | PASS |

The idempotency cases matter because the Phase 2 job will re-run over
already-final games every ten minutes.

## `jobs.sql` — schedulable wrappers

Covers the week *selection* the 0014 wrappers add over `lock_week` and
`score_week`; the grading rules themselves are `scoring.sql`'s job. Runs in a
transaction ending in ROLLBACK on fixture weeks 990 and 991.

Results as of 2026-08-24, all 9 passing:

| Test | Asserts | Result |
|---|---|---|
| 1 | `lock_due_weeks` locks a week past its `locks_at` | PASS |
| 2 | `lock_due_weeks` leaves a week whose lock time has not arrived | PASS |
| 3 | Locking creates the entry for a complete set | PASS |
| 4 | A second run in the same minute finds nothing due | PASS |
| 5 | That second run does not duplicate the entry | PASS |
| 6 | A locked week with no final games stays locked | PASS |
| 7 | `score_due_weeks` grades and flips the week to `scored` | PASS |
| 8 | The entry is graded correctly through the wrapper | PASS |
| 9 | A scored week drops out of the job and is never rewritten | PASS |

Tests 2 and 9 are the ones worth having. Both failures — locking a week early,
and rewriting a result that has already been published — are invisible in a
single run and only surface after the job has been on a timer for a week.

## `lines.sql` — applying lines and opening a week

Covers `private.apply_week_lines` and `private.next_week_needing_lines` (0016),
plus the grants on their `public` wrappers. Fixture weeks 980-982, transaction
ending in ROLLBACK.

Results as of 2026-08-24, all 16 passing:

| Test | Asserts | Result |
|---|---|---|
| 1 | `next_week_needing_lines` picks the earliest unfilled week | PASS |
| 2 | A partial fill updates the games it has | PASS |
| 3 | A partial fill reports the remaining gap | PASS |
| 4 | A partial fill does **not** open the week | PASS |
| 5 | The week is still `upcoming` after a partial fill | PASS |
| 6 | A complete fill leaves nothing missing | PASS |
| 7 | A complete fill opens the week | PASS |
| 8 | `over_odds` and `under_odds` land in the right columns | PASS |
| 9 | `line_source` is stored per game | PASS |
| 10 | A locked week accepts no updates | PASS |
| 11 | A locked week's line is unchanged | PASS |
| 12 | A locked week's `line_source` is unchanged | PASS |
| 13 | A filled week drops out of the sync queue | PASS |
| 14 | `anon` cannot execute the line writer | PASS |
| 15 | `authenticated` cannot execute the line writer | PASS |
| 16 | `service_role` can execute the line writer | PASS |

Tests 10-12 are the reason this file exists. Every entry in a locked week was
graded against the numbers standing at lock; a feed that rewrites one changes
what people were scored on after the fact.

Tests 8 and 14-16 guard defaults rather than logic. The source CSV lists
`under_odds` before `over_odds`, so a positional reader transposes them
invisibly; and `EXECUTE` is granted to PUBLIC by default on a new function,
which would put line-writing within reach of the publishable key that ships in
the build.

## `scores.sql` — applying scores and grading in the same call

Covers `private.apply_week_scores` and `private.next_week_needing_scores`
(0017), plus the grants on their `public` wrappers. Fixture weeks 970-972,
transaction ending in ROLLBACK. Written 2026-08-27; run it against the live
project once 0017 is applied — 21 assertions.

| Test | Asserts |
|---|---|
| 1 | `next_week_needing_scores` takes the started, locked week — not one that has not kicked off, not one still open |
| 2-3 | An open week accepts no scores and its game is untouched |
| 4-5 | A live score lands as `in_progress` with the score |
| 6 | A live score grades nothing |
| 7-9 | A final lands, is counted, and a partial slate does not score the week |
| 10-11 | The same call graded the pick and moved the entry |
| 12-13 | The feed cannot rewrite a final; the score stands |
| 14-16 | The last final scores the week and completes the entry |
| 17 | A scored week drops out of the queue |
| 18 | A later sweep of the scored week is a quiet no-op |
| 19-21 | `anon` and `authenticated` cannot execute the score writer; `service_role` can |

Test 6 pairs with the schema fact it leans on: `score_week` grades only games
whose *status* is final, so writing live scores is safe. Tests 12-13 are the
file's reason to exist — a final's grades may already be on someone's screen,
and only the operator's `set_final_score` may overrule one. Tests 19-21 matter
doubly here: through in-call grading, this door does not just write scores, it
scores the week.
