# Perfect Sunday — Hub, My Week, and Leaderboard

Design for the three screens that close the game loop. Companion to
[SPEC.md](../../SPEC.md) and to the
[hosting design](2026-08-21-github-pages-deployment-design.md). Where this
document and SPEC.md conflict, this one wins.

## 1. Why now

Phase 1 shipped everything a player needs to *make* picks and everything an
operator needs to *grade* them. It shipped nothing in between. A user picks
sixteen games, taps "Lock in picks", and the app has no further screen to
offer — no standings, no result, no reason to come back on Sunday night.

SPEC.md files the results screen and the weekly leaderboard under Phase 2,
behind the odds-provider integration. That ordering is wrong for a proof of
concept: the aggregator costs money and an account, while these three screens
cost neither and are what makes the demo a game rather than a form.

This design covers the hub, My Week, and the weekly leaderboard. The
emoji-grid results share stays in Phase 2 — it is the natural next step once
results exist, but it is a separate piece of work.

## 2. Decisions

Five decisions were taken by the operator on 2026-08-23. They are recorded
with their costs, not just their choices.

| Question | Decision | Cost accepted |
|---|---|---|
| Where does the hub live? | **Hub at `/`.** Signed-out sees sign-in; signed-in sees the hub. | `landingRoute` changes from `/picks` to `/`. The sign-in form becomes a component the root branches to, not a page of its own. |
| Who can see the leaderboard? | **Public.** No account needed. | Display names become world-readable and enumerable by anyone. See §8. |
| How do the screens divide? | **Three routes:** hub, `/week`, `/leaderboard`. | One more screen than the minimum. |
| How do users navigate? | **Bottom tab bar.** | Persistent chrome to build and to keep clear of the pick deck. |
| What does the board show pre-lock? | **Countdown, plus the last `scored` week's final standings.** | On the first demo week no prior week exists, so it is countdown only. |

The pre-lock decision is forced by an existing invariant worth restating:
`private.lock_week` creates an entry row **only for a user with a complete
set of picks**, and it runs at lock. Before lock there are no entries, so
there is nothing to rank. Creating entries earlier was rejected — it would
break the rule that an entry means a complete set, which both `lock_week` and
the scoring tests depend on.

## 3. Routes and layout

```
src/app/(app)/layout.tsx        tab bar + WeekProvider
src/app/(app)/page.tsx          hub           →  /
src/app/(app)/week/page.tsx     My Week       →  /week
src/app/(app)/leaderboard/      board         →  /leaderboard
src/app/picks/                  deck — OUTSIDE the group, no tab bar
src/app/welcome/                unchanged
src/app/rules/                  unchanged
```

`(app)` is a route group: it wraps the three tabbed screens in a shared
layout without adding a path segment.

The pick deck stays outside the group deliberately. It is a full-bleed,
swipe-driven surface, and a tab bar pinned under it would both steal thumb
space and offer a horizontal gesture target next to a horizontal swipe. The
deck gets a close button back to the hub instead.

### Root changes role

Today `/` renders the sign-in form and bounces a signed-in user to `/picks`.
After this change:

- **Signed-out** at `/` → sign-in form, rendered in place. Not a redirect,
  and **there is no `/signin` route**: the root is the only URL a new user is
  ever given, so it must resolve to something useful without a hop. The form
  moves out of `app/page.tsx` into `src/components/auth/SignInForm.tsx`, and
  the hub page branches on session state to render one or the other.
- **Signed-in, profile incomplete** → `/welcome`, unchanged.
- **Signed-in, profile complete** → the hub.

`landingRoute` in `src/lib/profile.ts` returns `"/"` instead of `"/picks"`.

### Signed-out on a public route

`/leaderboard` renders for anyone. A signed-out visitor sees the standings
and, where the other two tabs would be, a single "Sign in to play" call to
action. The tab bar is not shown to a signed-out user — two of its three tabs
would lead nowhere.

## 4. Data layer

All three screens read the same handful of rows. Fetching them per screen
would refetch week, games, and teams on every tab switch and flash a skeleton
each time — which is precisely the experience a tab bar exists to avoid.

In App Router a layout does not unmount when navigation moves between its
child routes. So the layout is where the data lives.

### WeekProvider

`src/components/app/WeekProvider.tsx` — a client component rendered by
`(app)/layout.tsx`, exposing context through a `useWeek()` hook.

```ts
type WeekContext = {
  phase: "loading" | "ready" | "error";
  error: string | null;
  week: Week | null;
  games: Game[];
  teams: Record<string, Team>;
  picks: ResultMap;        // own picks, with grades; empty when signed out
  entries: EntryRow[];     // public
  lastScored: Week | null; // for the pre-lock board
  refresh: () => void;
};
```

It loads once on mount and on `refresh()`. Screens are pure renderers over
this context and own no fetching.

Signed-out is a normal state, not an error: `picks` is empty and `entries`
still loads, because entries are public.

### New and changed queries

| Location | Change |
|---|---|
| `lib/week.ts` → `getGames` | Add `home_score, away_score, status` to the select. My Week needs the final score next to each pick. |
| `lib/week.ts` → `getLastScoredWeek` | **New.** Most recent week with `status = 'scored'`, for the pre-lock board. |
| `lib/picks.ts` → `getResults` | **New.** Like `getPicks` but also selects `total_correct, spread_correct`. Readable already — RLS and the column grant restrict *writing* the grading columns, never reading your own. |
| `lib/entries.ts` | **New file.** `getEntries(weekId)` selects entry columns plus `profiles(display_name)` through the existing `entries.user_id → profiles.id` foreign key. The embed works for a signed-out visitor only because migration 0012 grants anon `select` on `display_name`; without it PostgREST returns a permission error rather than a null name. |

`getPicks` stays as it is. The deck does not need grades, and widening its
select would pull graded columns into the one screen that must never show
them.

## 5. The hub

The hub answers one question at a glance: *what should I do right now?* The
answer differs by `weeks.status`, and each state gets its own layout rather
than one layout with fields blanked out.

| Status | Hub shows |
|---|---|
| `upcoming` | Slate not posted yet. Next lock time. Board tab still works, showing the last scored week. |
| `open` | **The main state.** Lock countdown, progress (`4 of 16 games picked`), primary CTA to `/picks`. A complete set instead reads "Picks in — change them until Thu 4:00 PM" with a share button. |
| `locked` | Picks frozen. Countdown to first kickoff, your 32 picks summarized, share button. The board becomes real here. |
| `scored` | Your record (`12 of 32`), the alive / busted / perfect verdict, your board position, link to the full standings. |

This table is the whole answer to "something to interact with before and
after picks are made". Before: countdown, progress, and a way in. After:
verdict and standings.

The hub never shows a raw empty state. Every status above has copy.

## 6. My Week (`/week`)

Your sixteen games in kickoff order.

That ordering is load-bearing and is already relied on twice — the deck and
the share grid both use it, and it is what makes two people comparing grids
look at the same game in the same row. My Week must not sort differently.

Each row carries the matchup, your over/under pick, your spread pick, and
once graded, a mark per side with the final score.

**Push handling:** a combined score landing exactly on the total, or a spread
landing exactly on the number, counts correct for **both** sides. The row
shows a check, not a distinct "push" state. This matches what the database
recorded and what the rules page promises; inventing a third visual state
here would contradict both.

### A refactor this pays for

`ReviewScreen` already renders a pick summary row and My Week needs the same
row with grades attached. The row moves to
`src/components/week/PickSummaryRow.tsx`, taking optional grade props, and
both screens use it. Without this, the two diverge the first time a line
format changes — and the last format change touched five copy strings across
the app.

Scope is limited to that extraction. No other refactoring of `ReviewScreen`.

## 7. Leaderboard (`/leaderboard`)

Sorted by `correct_count` descending, then `display_name` ascending so ties
have a stable, reproducible order rather than whatever Postgres returns.

Ties share a rank and the next rank skips accordingly — 1, 2, 2, 4. Two
people on 12 correct are tied, and showing one of them as third is wrong.

Each row: rank, display name, `12/32`, and an alive-or-busted chip. The chip
appears only once the week is `locked` or `scored`; before that everyone is
trivially alive and the chip carries no information.

Your own row is highlighted, and pinned into view if it falls below the fold.

Pre-lock, the screen shows the lock countdown and, beneath it, the last
`scored` week's final standings when one exists.

## 8. Migration 0012 — public profile reads

The board is public, but `profiles_select_authenticated` restricts profile
reads to signed-in users. Without a change, a signed-out visitor sees a board
of scores with no names attached.

```sql
create policy profiles_select_public on public.profiles
  for select to anon using (true);

revoke select on public.profiles from anon;
grant select (id, display_name, avatar_url) on public.profiles to anon;
```

Two mechanisms, because one is not enough. The policy grants the **rows**;
RLS is deny-by-default, so without it anon sees nothing. The column grant
narrows the **columns**, which RLS cannot express — it is the same mechanism
that stops a user marking their own picks correct. `terms_version`,
`terms_accepted_at`, and `created_at` stay hidden.

### The cost, stated plainly

This makes every display name world-readable and enumerable by anyone with
the publishable key, which ships in the build. There is no email, no
password, and no personal data in `profiles` — but a display name is a
handle a person chose, and after this it is public.

That is the deliberate price of a board a friend can open from a text message
without making an account, which is the growth loop SPEC.md §7 calls central.
At the current scale — two users and a proof of concept — the trade is
clearly worth it. It is recorded here because it is the kind of decision that
is easy to make once and never revisit.

Nothing else widens. `picks` policies are untouched: a signed-out visitor
still sees zero picks before lock.

## 9. Testing

Two new negative-case tests in `supabase/tests/rls.sql`, numbered 11 and 12:

- **11** — anon selects `terms_accepted_at` from `profiles`. Expect
  `ERROR 42501`. This is the test that proves the column grant, not just the
  policy, is doing work.
- **12** — anon selects `id, display_name` from `profiles`. Expect rows.
  Guards against a future tightening that silently blanks the public board.

The existing suites must still pass unchanged: 10 RLS tests and 11 scoring
tests. Test 3 in particular — anon reads zero picks while the week is open —
is the assertion that 0012 widened profiles and nothing else.

`supabase/tests/README.md` gets both new rows.

## 9a. Amendments made during implementation

Recorded on 2026-08-23, after the branch was built and reviewed. The spec is
the binding document, so where the delivered code fell short of it, that is
written here rather than left as a silent disagreement.

**Deferred from §5 and §7.** Four items this document promised were not built:

| Promised | Why it was deferred |
|---|---|
| Share button on the hub, in the `open`-complete and `locked` states | The deck's review screen already ships a working share of the same picks, so the growth loop this served is not blocked — only its second entry point is missing. |
| Countdown to first kickoff on the `locked` hub | `countdownTo` hardcodes a "to lock" label and has other callers; changing it belonged in the feature work, not in a final fix wave. |
| Board position on the `scored` hub | One number, and the hub already links straight to the full board. |
| Pinning your own row into view on the leaderboard when it falls below the fold | Meaningless at the current scale of two players. The highlight shipped; the scroll behaviour did not. |

None is load-bearing for the loop the branch set out to close. All four remain
worth building, and this table is the record that they are owed.

**One security consequence §8 did not state.** Because `picks` becomes readable
by anyone after a week locks (`picks_select_after_lock`, unchanged by this
work), granting anon the `display_name` column means a signed-out visitor can
now *attribute* those post-lock picks to a named player, where before they
could read the picks but not the names. Pre-lock behaviour is unchanged and
still verified by test 3. This is a consequence of the public board that was
chosen deliberately, but it was not spelled out above and should have been.

## 10. Out of scope

Deliberately not in this piece of work:

- Emoji-grid results share. Next after this, and it depends on this.
- Odds provider integration and the three scheduled Edge Functions.
- Groups, join codes, season standings, My Picks history.
- A client path to `lock_week`. The operator still runs it by hand from the
  SQL editor; nothing here changes that.

## 11. Known issues this work does not fix

Recorded so they are not mistaken for regressions:

- ~~`supabase/OPERATIONS.md` hardcodes `week_id = 1` in steps 3, 4, and the
  demo reset. The live week is **id 2**, so those statements silently affect
  nothing. Small fix, separate change.~~ **Fixed 2026-08-24.** Every statement
  in that doc now resolves the week by `(season, week_number)`, the form steps
  1 and 2 already used, so no literal id can go stale again. The demo reset was
  additionally scoped to the week — it had been clearing `total_correct` and
  `spread_correct` on every pick in every week.
- ~~`teams` has 32 rows and zero populated records, so the deck hides the
  record and PPG line by design. Cards look emptier than intended.~~ **Fixed
  2026-08-24** by migration 0013, which seeds every club's real 2025 final
  record, PPG and points allowed, computed from the 272 completed 2025
  regular-season results published by nflverse rather than written from memory.

  These are last season's numbers, so the card names the season: a new
  `teams.stats_season` column travels with the four stat values, and
  `statsProvenance()` renders it as "2025 final" once per card. The stat line
  is gated on that label existing, so numbers can never appear without the
  season they belong to — an unlabelled 14-3 beside a Week 1 matchup reads as
  this year's form. From Week 2 the same label reads "2026 thru wk 2" as soon
  as something writes current-season numbers, with no code change.
- The rules page posts a $1,000 prize against roughly 1-in-665-million odds
  after the over/under change. Over-safe by a wide margin; the prize has room
  to rise.
