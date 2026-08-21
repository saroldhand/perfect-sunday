# RLS tests

`rls.sql` asserts the deny case for every policy that guards user data. It is
the difference between "RLS is enabled" and "RLS works".

Run it against the project database. Statements marked **Expect ERROR 42501**
are supposed to fail, so a client that halts on the first error will stop
there. Each test is its own transaction for that reason — run them
individually, or through a harness that records the error and continues.

Results as of 2026-08-21, all 10 passing:

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

Test 7 exists because the fix for test 6 — revoking UPDATE on `picks` and
re-granting only `moneyline_pick` and `spread_pick` — is exactly the kind of
change that silently breaks the write path it is meant to narrow.

Test 9 counts affected rows through a CTE rather than reading RETURNING output.
A blocked UPDATE returns no rows, which looks identical to a statement that ran
and matched nothing.
