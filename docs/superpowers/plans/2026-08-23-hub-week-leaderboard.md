# Hub, My Week, and Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the game loop — give a player a hub to land on, a screen showing their graded picks, and a public weekly leaderboard, reachable from a bottom tab bar.

**Architecture:** A Next.js route group `(app)` wraps three screens in a shared layout that renders the tab bar and a `WeekProvider`. The provider fetches week, games, teams, the user's picks, and public entries exactly once; because an App Router layout does not unmount between its own child routes, tab switches are instant and screens are pure renderers. Branching logic — leaderboard ranking, hub state selection — lives in pure functions with unit tests, so components stay dumb.

**Tech Stack:** Next.js 16.3.2 App Router with `output: 'export'`, React 19, Tailwind 4, TypeScript, Supabase JS v2, Vitest (added by Task 1).

**Spec:** [docs/superpowers/specs/2026-08-23-hub-week-leaderboard-design.md](../specs/2026-08-23-hub-week-leaderboard-design.md)

## Global Constraints

- **Static export only.** `output: 'export'`. No middleware, no route handlers, no server actions, no `next/image` optimizer. Every screen is a client component.
- **basePath comes from the environment.** `NEXT_PUBLIC_BASE_PATH` — never hardcode `/perfect-sunday`. `next/link` and `router.push` apply it automatically; opaque strings (manifest, metadata icons) must prefix it by hand.
- **`trailingSlash: true`.** `usePathname()` returns `/week/`, not `/week`. Any path comparison must normalize.
- **One Supabase project only:** ref `vockiqvlijtkxvpdttya`. Never issue a call against another ref. See CLAUDE.md.
- **RLS is the security model.** The publishable key ships in the bundle. Every table gets policies; every policy gets a negative-case test.
- **Never widen write access to grading columns.** `authenticated` holds UPDATE on exactly `(total_pick, spread_pick)` on `public.picks`. That grant is what stops a user marking their own picks correct.
- **Kickoff order is load-bearing.** The deck, the share grid, and My Week must list games in the same order — `order by kickoff_at, id`. It is what lets two people compare grids row by row.
- **Colour discipline.** `--color-correct` (#2FBF71) and `--color-wrong` (#E5484D) are reserved exclusively for pick outcomes. Never use them for buttons, links, or decoration.
- **Dark theme only.** Palette tokens live in `src/app/globals.css`. Use `var(--color-*)`, never literal hex, except the existing `#0B0D10` button-text convention.
- **Thumb targets.** Minimum 44pt. Existing convention is `min-h-14` for primary buttons.
- **Copy says "over/under" and "spread".** The word "moneyline" must not appear anywhere in the app.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Test runner config: node environment, `@/` alias. |
| `src/lib/leaderboard.ts` | Pure. Owns the `EntryRow` shape and `rankEntries` (competition ranking with ties). |
| `src/lib/leaderboard.test.ts` | Unit tests for ranking. |
| `src/lib/entries.ts` | Supabase reads for `entries`, plus the pure `toEntryRows` mapper. |
| `src/lib/entries.test.ts` | Unit tests for the mapper. |
| `src/lib/hub.ts` | Pure. `hubView()` — which of five hub states applies — and `verdictOf()`. |
| `src/lib/hub.test.ts` | Unit tests for the state selector. |
| `src/components/auth/SignInForm.tsx` | The magic-link form, lifted out of the old root page. |
| `src/components/app/WeekProvider.tsx` | Fetches everything once; exposes `useWeek()`. |
| `src/components/app/TabBar.tsx` | Fixed bottom navigation. Renders nothing when signed out. |
| `src/components/week/PickSummaryRow.tsx` | One game's row, with optional grade and score. Shared by ReviewScreen and My Week. |
| `src/app/(app)/layout.tsx` | Route-group layout: provider + tab bar + page frame. |
| `src/app/(app)/page.tsx` | Hub. Signed-out renders `SignInForm`. |
| `src/app/(app)/week/page.tsx` | My Week. |
| `src/app/(app)/leaderboard/page.tsx` | Public standings. |
| `supabase/migrations/0012_public_profile_reads.sql` | anon SELECT on profiles, narrowed by column grant. |

**Modified:**

| File | Change |
|---|---|
| `package.json` | `vitest` devDependency, `test` script. |
| `src/lib/week.ts` | `Game` gains score and status; `getGames` selects them; new `getLastScoredWeek`. |
| `src/lib/picks.ts` | New `getResults` / `ResultMap`. `getPicks` untouched. |
| `src/lib/profile.ts` | `landingRoute` returns `"/"` instead of `"/picks"`. |
| `src/app/page.tsx` | **Deleted.** Its route is taken over by `(app)/page.tsx`; its form becomes `SignInForm`. |
| `src/app/welcome/page.tsx:79` | Redirect to `/` instead of `/picks`. |
| `src/app/picks/page.tsx` | Close button back to the hub. |
| `src/components/picks/ReviewScreen.tsx` | Row rendering replaced by `PickSummaryRow`. |
| `supabase/tests/rls.sql` | Tests 11 and 12. |
| `supabase/tests/README.md` | Two result rows. |

---

## Task 1: Test runner and leaderboard ranking

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/leaderboard.ts`
- Test: `src/lib/leaderboard.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `type EntryRow = { user_id: string; display_name: string; correct_count: number; picks_possible: number; is_alive: boolean; is_complete: boolean; is_perfect: boolean }`; `type RankedEntry = EntryRow & { rank: number }`; `rankEntries(rows: EntryRow[]): RankedEntry[]`.

The project has no JavaScript test runner today — only two SQL suites. Ranking with ties is exactly the logic that breaks silently and stays broken, so it gets real tests. Vitest is a devDependency; it adds nothing to the bundle.

`EntryRow` is defined here, in the pure module, rather than in the Supabase module. The database layer maps *into* this shape, which keeps the tested code free of any import of the Supabase client.

- [ ] **Step 1: Install Vitest and add the script**

```bash
npm install --save-dev vitest
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 2: Write the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Node environment on purpose: everything under test is a pure function. No
// jsdom, no testing-library, no component rendering — adding those is a
// separate decision with its own cost.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/leaderboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rankEntries, type EntryRow } from "@/lib/leaderboard";

function entry(display_name: string, correct_count: number): EntryRow {
  return {
    user_id: display_name.toLowerCase(),
    display_name,
    correct_count,
    picks_possible: 32,
    is_alive: false,
    is_complete: true,
    is_perfect: false,
  };
}

describe("rankEntries", () => {
  it("sorts by correct_count descending", () => {
    const ranked = rankEntries([entry("Ann", 8), entry("Bob", 20), entry("Cal", 14)]);
    expect(ranked.map((r) => r.display_name)).toEqual(["Bob", "Cal", "Ann"]);
  });

  it("breaks ties by display name so the order is stable", () => {
    const ranked = rankEntries([entry("Zed", 12), entry("Ann", 12)]);
    expect(ranked.map((r) => r.display_name)).toEqual(["Ann", "Zed"]);
  });

  it("gives tied entries the same rank and skips the next", () => {
    const ranked = rankEntries([
      entry("Ann", 20),
      entry("Bob", 12),
      entry("Cal", 12),
      entry("Dee", 9),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("does not mutate its input", () => {
    const rows = [entry("Ann", 8), entry("Bob", 20)];
    rankEntries(rows);
    expect(rows.map((r) => r.display_name)).toEqual(["Ann", "Bob"]);
  });

  it("returns an empty array for no entries", () => {
    expect(rankEntries([])).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "@/lib/leaderboard"`.

- [ ] **Step 5: Write the implementation**

Create `src/lib/leaderboard.ts`:

```ts
/**
 * One row of the weekly board. Defined here rather than in the Supabase
 * module so the ranking logic — the part that can be wrong in a way nobody
 * notices — is testable without a database.
 */
export type EntryRow = {
  user_id: string;
  display_name: string;
  correct_count: number;
  picks_possible: number;
  is_alive: boolean;
  is_complete: boolean;
  is_perfect: boolean;
};

export type RankedEntry = EntryRow & { rank: number };

/**
 * Standard competition ranking: tied entries share a rank and the next rank
 * skips — 1, 2, 2, 4. Two people on twelve correct are tied, and showing one
 * of them as third is simply wrong.
 *
 * Ties break on display name so the board is reproducible between loads.
 * Without it Postgres returns whatever order it likes and the list reshuffles
 * under the reader.
 */
export function rankEntries(rows: EntryRow[]): RankedEntry[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count;
    return a.display_name.localeCompare(b.display_name, "en");
  });

  let rank = 0;
  let previous: number | null = null;

  return sorted.map((row, index) => {
    if (previous === null || row.correct_count !== previous) {
      rank = index + 1;
      previous = row.correct_count;
    }
    return { ...row, rank };
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — 5 tests.

- [ ] **Step 7: Verify the build and lint still pass**

```bash
npm run lint && npx next build
```

Expected: no errors. This catches the case where a `.test.ts` file inside `src/` breaks the Next type check.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/leaderboard.ts src/lib/leaderboard.test.ts
git commit -m "test: add vitest; feat: competition ranking for the weekly board"
```

---

## Task 2: Migration 0012 — public profile reads

**Files:**
- Create: `supabase/migrations/0012_public_profile_reads.sql`
- Modify: `supabase/tests/rls.sql`
- Modify: `supabase/tests/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: anon can `select id, display_name, avatar_url` from `public.profiles`. Required by `getEntries` in Task 3 — a PostgREST embed of `profiles(display_name)` returns a permission error, not a null name, without it.

Two mechanisms, because one is not enough. RLS is deny-by-default, so the **policy** is what grants the rows. RLS cannot express column rules, so the **column grant** is what hides `terms_accepted_at` and `created_at`. Same division of labour that protects the grading columns on `picks`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_public_profile_reads.sql`:

```sql
-- The weekly leaderboard is public: a friend opens a shared link and sees the
-- standings without an account. Entries are already anon-readable
-- (entries_select_public), but profiles are not, so a signed-out visitor would
-- see a board of scores with no names on it.
--
-- The policy grants the rows. RLS is deny-by-default, so nothing is visible
-- without it. The column grant narrows which columns come back, which RLS
-- cannot express — the same two-part mechanism that stops a user marking their
-- own picks correct.
--
-- The cost, stated rather than buried: this makes every display name
-- world-readable and enumerable by anyone holding the publishable key, which
-- ships in the build. There is no email, password, or personal data in
-- profiles, but a display name is a handle a person chose. That is the
-- deliberate price of a board that works without an account.

create policy profiles_select_public on public.profiles
  for select to anon using (true);

revoke select on public.profiles from anon;
grant select (id, display_name, avatar_url) on public.profiles to anon;
```

- [ ] **Step 2: Apply it**

Apply via the pinned Supabase MCP server: `mcp__supabase__apply_migration` with name `0012_public_profile_reads` and the SQL above.

**Stop and report** if any Supabase tool appears under a name other than `mcp__supabase__*`.

- [ ] **Step 3: Verify the grant landed exactly as intended**

Run via `mcp__supabase__execute_sql`:

```sql
select grantee, string_agg(column_name, ', ' order by column_name) as cols
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated')
group by grantee order by grantee;
```

Expected: `anon` → `avatar_url, display_name, id` and nothing else. `authenticated` → all seven columns.

- [ ] **Step 4: Add the two negative-case tests**

In `supabase/tests/rls.sql`, insert immediately **before** the `-- === teardown ===` line:

```sql
-- === TEST 11: anon reads a hidden profile column. Expect ERROR 42501 ========
-- The policy lets anon see profile rows; only the column grant stops it
-- reading when someone accepted the terms. This is the test for that grant.
-- Expected: permission denied for table profiles
begin;
set local role anon;
select terms_accepted_at from public.profiles limit 1;
rollback;

-- === TEST 12: anon reads the public profile columns. Expect 2 rows ==========
-- The mirror of test 11. Guards against a future tightening that silently
-- blanks every name on the public board.
begin;
set local role anon;
select 'TEST 12 anon reads public profile columns' as test, count(*) as rows_visible,
       case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict
from (
  select id, display_name from public.profiles
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222')
) p;
rollback;
```

- [ ] **Step 5: Run the whole RLS suite and confirm 12 of 12**

Run each numbered block from `supabase/tests/rls.sql` through `mcp__supabase__execute_sql`, in order, starting with the setup block and finishing with teardown. Blocks marked **Expect ERROR 42501** are supposed to raise; record the error and continue.

Expected:

| Test | Expected |
|---|---|
| 1 | PASS |
| 2 | 0 rows — PASS |
| 3 | 0 rows — PASS (this is the assertion that 0012 widened profiles and nothing else) |
| 4 | 1 row — PASS |
| 5 | ERROR 42501 |
| 6 | ERROR 42501 |
| 7 | PASS |
| 8 | 1 row — PASS |
| 9 | 0 rows updated — PASS |
| 10 | ERROR 42501 |
| 11 | ERROR 42501 — `permission denied for table profiles` |
| 12 | 2 rows — PASS |

If test 3 does not return 0, **stop**: 0012 has widened more than profiles.

- [ ] **Step 6: Update the test README**

In `supabase/tests/README.md`, change "all 10 passing" to "all 12 passing", update the date to 2026-08-23, and append to the results table:

```markdown
| 11 | A signed-out visitor cannot read `terms_accepted_at` from a profile | PASS — 42501 |
| 12 | A signed-out visitor can read display names for the public board | PASS |
```

Then add below the existing test-7 and test-9 notes:

```markdown
Tests 11 and 12 are a pair. The public leaderboard needs anon to read display
names, and 0012 grants exactly three columns to do it. Test 11 proves the
column grant is load-bearing; test 12 proves it did not overshoot and blank
the board.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0012_public_profile_reads.sql supabase/tests/rls.sql supabase/tests/README.md
git commit -m "feat(db): public profile reads for the leaderboard, narrowed by column grant"
```

---

## Task 3: Data layer

**Files:**
- Create: `src/lib/entries.ts`
- Test: `src/lib/entries.test.ts`
- Modify: `src/lib/week.ts`
- Modify: `src/lib/picks.ts`

**Interfaces:**
- Consumes: `EntryRow` from `@/lib/leaderboard` (Task 1); the anon column grant from Task 2.
- Produces:
  - `toEntryRows(raw: RawEntry[]): EntryRow[]`
  - `getEntries(weekId: number): Promise<EntryRow[]>`
  - `getLastScoredWeek(): Promise<Week | null>`
  - `Game` gains `home_score: number | null`, `away_score: number | null`, `status: GameStatus`
  - `type GameStatus = "scheduled" | "in_progress" | "final"`
  - `type Result = { total: TotalSide | null; spread: string | null; totalCorrect: boolean | null; spreadCorrect: boolean | null }`
  - `type ResultMap = Record<string, Result>`
  - `getResults(userId: string, gameIds: string[]): Promise<ResultMap>`

`getPicks` is left exactly as it is. The deck does not need grades, and widening its select would pull graded columns into the one screen that must never display them.

- [ ] **Step 1: Write the failing mapper test**

Create `src/lib/entries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toEntryRows } from "@/lib/entries";

describe("toEntryRows", () => {
  it("flattens the embedded profile into display_name", () => {
    const rows = toEntryRows([
      {
        user_id: "u1",
        correct_count: 21,
        picks_possible: 32,
        is_alive: false,
        is_complete: true,
        is_perfect: false,
        profiles: { display_name: "Harry S" },
      },
    ]);
    expect(rows[0].display_name).toBe("Harry S");
    expect(rows[0].correct_count).toBe(21);
  });

  it("falls back to a placeholder when the profile embed is null", () => {
    const rows = toEntryRows([
      {
        user_id: "u1",
        correct_count: 0,
        picks_possible: 32,
        is_alive: true,
        is_complete: true,
        is_perfect: false,
        profiles: null,
      },
    ]);
    expect(rows[0].display_name).toBe("Unknown player");
  });

  it("returns an empty array for no entries", () => {
    expect(toEntryRows([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "@/lib/entries"`.

- [ ] **Step 3: Write `src/lib/entries.ts`**

```ts
import { supabase } from "@/lib/supabase/client";
import type { EntryRow } from "@/lib/leaderboard";

/** Shape PostgREST returns for the embed. A many-to-one embed is an object,
 *  not an array. */
export type RawEntry = {
  user_id: string;
  correct_count: number;
  picks_possible: number;
  is_alive: boolean;
  is_complete: boolean;
  is_perfect: boolean;
  profiles: { display_name: string } | null;
};

export function toEntryRows(raw: RawEntry[]): EntryRow[] {
  return raw.map((row) => ({
    user_id: row.user_id,
    // A null embed means the profile row was deleted but the cascade has not
    // run, or a future policy hid it. Neither should blank out a whole line of
    // the board.
    display_name: row.profiles?.display_name ?? "Unknown player",
    correct_count: row.correct_count,
    picks_possible: row.picks_possible,
    is_alive: row.is_alive,
    is_complete: row.is_complete,
    is_perfect: row.is_perfect,
  }));
}

/**
 * Every entry for a week, with the player's name. Readable signed-out:
 * entries_select_public covers the rows, and migration 0012 grants anon the
 * display_name column the embed needs.
 */
export async function getEntries(weekId: number): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from("entries")
    .select(
      "user_id, correct_count, picks_possible, is_alive, is_complete, is_perfect, profiles(display_name)",
    )
    .eq("week_id", weekId);

  if (error) throw new Error(error.message);
  return toEntryRows((data ?? []) as unknown as RawEntry[]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS — 8 tests total (5 from Task 1, 3 here).

- [ ] **Step 5: Widen `Game` and add `getLastScoredWeek`**

In `src/lib/week.ts`, add the status type above the `Game` type:

```ts
export type GameStatus = "scheduled" | "in_progress" | "final";
```

Add three fields to the `Game` type, after `under_odds`:

```ts
  home_score: number | null;
  away_score: number | null;
  status: GameStatus;
```

Change the select inside `getGames` to:

```ts
    .select(
      "id, home_team, away_team, kickoff_at, spread, total, over_odds, under_odds, home_score, away_score, status",
    )
```

Append to the end of the file:

```ts
/**
 * The most recent finished week. The board shows this before the current
 * week locks, because entries do not exist until lock_week runs and there is
 * nothing to rank until then.
 */
export async function getLastScoredWeek(): Promise<Week | null> {
  const { data, error } = await supabase
    .from("weeks")
    .select("id, season, week_number, locks_at, status")
    .eq("status", "scored")
    .order("season", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Week) ?? null;
}
```

- [ ] **Step 6: Add `getResults` to `src/lib/picks.ts`**

Append to the end of the file:

```ts
/** A pick plus how it graded. Null grade means not graded yet — never wrong. */
export type Result = Pick & {
  totalCorrect: boolean | null;
  spreadCorrect: boolean | null;
};

export type ResultMap = Record<string, Result>;

type ResultRow = PickRow & {
  total_correct: boolean | null;
  spread_correct: boolean | null;
};

/**
 * Own picks with their grades, for My Week and the hub.
 *
 * Reading the grading columns is allowed and always has been — RLS and the
 * column grant restrict who may *write* total_correct and spread_correct,
 * never who may read their own. getPicks stays grade-free on purpose: the
 * deck is the one screen that must never show them.
 */
export async function getResults(
  userId: string,
  gameIds: string[],
): Promise<ResultMap> {
  if (gameIds.length === 0) return {};

  const { data, error } = await supabase
    .from("picks")
    .select("game_id, total_pick, spread_pick, total_correct, spread_correct")
    .eq("user_id", userId)
    .in("game_id", gameIds);

  if (error) throw new Error(error.message);

  const map: ResultMap = {};
  for (const row of (data ?? []) as ResultRow[]) {
    map[row.game_id] = {
      total: (row.total_pick as TotalSide | null) ?? null,
      spread: row.spread_pick,
      totalCorrect: row.total_correct,
      spreadCorrect: row.spread_correct,
    };
  }
  return map;
}
```

- [ ] **Step 7: Verify the live queries against the real database**

Run via `mcp__supabase__execute_sql` — this is the check that the embed and the column grant actually cooperate:

```sql
begin;
set local role anon;
select e.user_id, e.correct_count, p.display_name
from public.entries e join public.profiles p on p.id = e.user_id
limit 5;
rollback;
```

`set local` is only legal inside a transaction — without the `begin`/`rollback`
it raises `SET LOCAL can only be used in transaction blocks` and proves
nothing.

Expected: succeeds. Zero rows is the correct result today — the demo week has not been locked, so no entries exist. An error here means Task 2 did not land.

- [ ] **Step 8: Verify lint and build**

```bash
npm test && npm run lint && npx next build
```

Expected: 8 tests pass, no lint errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/entries.ts src/lib/entries.test.ts src/lib/week.ts src/lib/picks.ts
git commit -m "feat(data): entries reads, game scores, graded pick reads, last scored week"
```

---

## Task 4: Hub state selector

**Files:**
- Create: `src/lib/hub.ts`
- Test: `src/lib/hub.test.ts`

**Interfaces:**
- Consumes: `Week` from `@/lib/week`; `EntryRow` from `@/lib/leaderboard`.
- Produces:
  - `type Verdict = "perfect" | "alive" | "busted" | "no-entry"`
  - `verdictOf(entry: EntryRow | null): Verdict`
  - `type HubView` — five-way discriminated union, see below
  - `hubView(input: HubInput): HubView`

The hub shows a different thing in each of four week states plus the no-week case. Putting that branching in a pure function means all five states are tested, including the two an operator will rarely see by hand.

- [ ] **Step 1: Write the failing test**

Create `src/lib/hub.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hubView, verdictOf } from "@/lib/hub";
import type { Week } from "@/lib/week";
import type { EntryRow } from "@/lib/leaderboard";

function week(status: Week["status"]): Week {
  return {
    id: 2,
    season: 2025,
    week_number: 18,
    locks_at: "2026-09-10T20:00:00Z",
    status,
  };
}

function entry(over: Partial<EntryRow> = {}): EntryRow {
  return {
    user_id: "u1",
    display_name: "Harry S",
    correct_count: 21,
    picks_possible: 32,
    is_alive: false,
    is_complete: true,
    is_perfect: false,
    ...over,
  };
}

describe("verdictOf", () => {
  it("reports no-entry when the user never got an entry", () => {
    expect(verdictOf(null)).toBe("no-entry");
  });

  it("reports perfect ahead of alive", () => {
    expect(verdictOf(entry({ is_perfect: true, is_alive: true }))).toBe("perfect");
  });

  it("reports alive while no pick has missed", () => {
    expect(verdictOf(entry({ is_alive: true }))).toBe("alive");
  });

  it("reports busted once a pick has missed", () => {
    expect(verdictOf(entry({ is_alive: false }))).toBe("busted");
  });
});

describe("hubView", () => {
  it("handles an empty database", () => {
    expect(hubView({ week: null, totalGames: 0, completed: 0, entry: null }).kind).toBe(
      "no-week",
    );
  });

  it("handles a week with no slate posted", () => {
    const view = hubView({ week: week("upcoming"), totalGames: 0, completed: 0, entry: null });
    expect(view).toEqual({ kind: "upcoming", week: week("upcoming") });
  });

  it("reports progress while the week is open", () => {
    const view = hubView({ week: week("open"), totalGames: 16, completed: 4, entry: null });
    expect(view).toEqual({
      kind: "open",
      week: week("open"),
      completed: 4,
      totalGames: 16,
      allIn: false,
    });
  });

  it("marks a complete set as all in", () => {
    const view = hubView({ week: week("open"), totalGames: 16, completed: 16, entry: null });
    expect(view).toMatchObject({ kind: "open", allIn: true });
  });

  it("reports a locked week without a score", () => {
    const view = hubView({ week: week("locked"), totalGames: 16, completed: 16, entry: entry() });
    expect(view).toMatchObject({ kind: "locked", totalGames: 16 });
  });

  it("reports the record and verdict once scored", () => {
    const view = hubView({
      week: week("scored"),
      totalGames: 16,
      completed: 16,
      entry: entry({ correct_count: 21 }),
    });
    expect(view).toMatchObject({
      kind: "scored",
      correct: 21,
      possible: 32,
      verdict: "busted",
    });
  });

  it("reports no-entry for someone who never completed a set", () => {
    const view = hubView({ week: week("scored"), totalGames: 16, completed: 9, entry: null });
    expect(view).toMatchObject({ kind: "scored", verdict: "no-entry", correct: 0 });
  });

  it("treats an open week with no games as upcoming", () => {
    // A week can be flipped open before its slate is loaded. Showing "0 of 0
    // picked" with a CTA into an empty deck is worse than saying nothing yet.
    const view = hubView({ week: week("open"), totalGames: 0, completed: 0, entry: null });
    expect(view.kind).toBe("upcoming");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `Failed to resolve import "@/lib/hub"`.

- [ ] **Step 3: Write `src/lib/hub.ts`**

```ts
import type { Week } from "@/lib/week";
import type { EntryRow } from "@/lib/leaderboard";

export type Verdict = "perfect" | "alive" | "busted" | "no-entry";

/**
 * "no-entry" is not a failure state to hide. lock_week creates an entry only
 * for a complete set, so someone who picked twelve of sixteen has no entry,
 * is not scored, and does not appear on the board. Saying so plainly is the
 * whole point of blocking partial entries.
 */
export function verdictOf(entry: EntryRow | null): Verdict {
  if (!entry) return "no-entry";
  if (entry.is_perfect) return "perfect";
  if (entry.is_alive) return "alive";
  return "busted";
}

export type HubInput = {
  week: Week | null;
  totalGames: number;
  completed: number;
  entry: EntryRow | null;
};

export type HubView =
  | { kind: "no-week" }
  | { kind: "upcoming"; week: Week }
  | { kind: "open"; week: Week; completed: number; totalGames: number; allIn: boolean }
  | { kind: "locked"; week: Week; totalGames: number }
  | { kind: "scored"; week: Week; correct: number; possible: number; verdict: Verdict };

/**
 * Which of five states the hub is in. Each gets its own layout rather than one
 * layout with fields blanked out, because "4 of 16 picked" and "21 of 32
 * correct" are not the same sentence with different numbers in it.
 */
export function hubView(input: HubInput): HubView {
  const { week, totalGames, completed, entry } = input;

  if (!week) return { kind: "no-week" };

  // A week with no slate is upcoming whatever its status column says. Picks
  // open only once every game has a posted line.
  if (week.status === "upcoming" || totalGames === 0) {
    return { kind: "upcoming", week };
  }

  if (week.status === "open") {
    return {
      kind: "open",
      week,
      completed,
      totalGames,
      allIn: completed === totalGames,
    };
  }

  if (week.status === "locked") {
    return { kind: "locked", week, totalGames };
  }

  return {
    kind: "scored",
    week,
    correct: entry?.correct_count ?? 0,
    possible: entry?.picks_possible ?? totalGames * 2,
    verdict: verdictOf(entry),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — 20 tests total (5 leaderboard, 3 entries, 12 hub).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hub.ts src/lib/hub.test.ts
git commit -m "feat: pure hub state selector covering all five week states"
```

---

## Task 5: Route group, provider, and tab bar

**Files:**
- Create: `src/components/app/WeekProvider.tsx`
- Create: `src/components/app/TabBar.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/page.tsx` (temporary placeholder, replaced in Task 6)
- Delete: `src/app/page.tsx`
- Create: `src/components/auth/SignInForm.tsx`

**Interfaces:**
- Consumes: `getCurrentWeek`, `getGames`, `getTeams`, `getLastScoredWeek` from `@/lib/week`; `getResults` from `@/lib/picks`; `getEntries` from `@/lib/entries`; `getProfile` from `@/lib/profile`; `useSession` from `@/hooks/useSession`.
- Produces: `useWeek(): WeekContextValue` — see the type below. `<SignInForm />` takes no props.

Both `src/app/page.tsx` and `src/app/(app)/page.tsx` resolve to `/`. The old one must be deleted in the same commit or the build fails with a duplicate-route error.

- [ ] **Step 1: Lift the sign-in form into a component**

Create `src/components/auth/SignInForm.tsx` containing the entire current contents of `src/app/page.tsx`, with these changes:

- Rename the default export `SignIn` to a **named** export `export function SignInForm()`.
- Delete the `useSession` import, the `useRouter` import, the `getProfile`/`landingRoute` import, the `session` variable, the redirect `useEffect`, and the `session.status === "checking"` early return. The hub owns session branching now; this component only ever renders for a signed-out visitor.
- Delete the `Skeleton` helper at the bottom of the file. It existed only for the `checking` branch being removed, and leaving it behind is an unused-variable lint error.
- Keep `Shell`, the magic-link form, the flag-disabled Google block, and every copy string exactly as they are.
- Keep `"use client"` at the top.

- [ ] **Step 2: Delete the old root page**

```bash
git rm src/app/page.tsx
```

- [ ] **Step 3: Write the provider**

Create `src/components/app/WeekProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { getProfile, type Profile } from "@/lib/profile";
import {
  getCurrentWeek,
  getGames,
  getLastScoredWeek,
  getTeams,
  type Game,
  type Team,
  type Week,
} from "@/lib/week";
import { getResults, type ResultMap } from "@/lib/picks";
import { getEntries } from "@/lib/entries";
import type { EntryRow } from "@/lib/leaderboard";

export type WeekContextValue = {
  phase: "loading" | "ready" | "error";
  error: string | null;
  signedIn: boolean;
  userId: string | null;
  profile: Profile | null;
  week: Week | null;
  games: Game[];
  teams: Record<string, Team>;
  results: ResultMap;
  /** The week whose standings the board shows: the current one once it is
   *  locked, otherwise the last finished week. */
  boardWeek: Week | null;
  boardEntries: EntryRow[];
  refresh: () => void;
};

const EMPTY: WeekContextValue = {
  phase: "loading",
  error: null,
  signedIn: false,
  userId: null,
  profile: null,
  week: null,
  games: [],
  teams: {},
  results: {},
  boardWeek: null,
  boardEntries: [],
  refresh: () => {},
};

const WeekContext = createContext<WeekContextValue>(EMPTY);

export function useWeek() {
  return useContext(WeekContext);
}

/**
 * Loads everything the three tabbed screens need, once.
 *
 * It lives in the route-group layout because an App Router layout does not
 * unmount while navigation stays within its own child routes. Fetching per
 * screen instead would refetch week, games, and teams on every tab switch and
 * flash a skeleton each time — which is the exact experience a tab bar exists
 * to avoid.
 */
export function WeekProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [value, setValue] = useState<WeekContextValue>(EMPTY);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Signed-out is a normal state here, not an error: the board is public.
    // Only "checking" means wait.
    if (session.status === "checking") return;

    const userId = session.status === "signed-in" ? session.session.user.id : null;
    let active = true;

    (async () => {
      const [week, teams, profile] = await Promise.all([
        getCurrentWeek(),
        getTeams(),
        userId ? getProfile(userId) : Promise.resolve(null),
      ]);
      if (!active) return;

      const games = week ? await getGames(week.id) : [];
      if (!active) return;

      const results =
        userId && games.length > 0
          ? await getResults(userId, games.map((g) => g.id))
          : {};
      if (!active) return;

      // Entries exist only from lock onward, so before that the board falls
      // back to the last finished week.
      const showsCurrent =
        week !== null && (week.status === "locked" || week.status === "scored");
      const boardWeek = showsCurrent ? week : await getLastScoredWeek();
      if (!active) return;

      const boardEntries = boardWeek ? await getEntries(boardWeek.id) : [];
      if (!active) return;

      setValue({
        phase: "ready",
        error: null,
        signedIn: userId !== null,
        userId,
        profile,
        week,
        games,
        teams,
        results,
        boardWeek,
        boardEntries,
        refresh,
      });
    })().catch((err: unknown) => {
      if (!active) return;
      setValue({
        ...EMPTY,
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
        refresh,
      });
    });

    return () => {
      active = false;
    };
  }, [session, nonce, refresh]);

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}
```

- [ ] **Step 4: Write the tab bar**

Create `src/components/app/TabBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeek } from "@/components/app/WeekProvider";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/week", label: "My Week" },
  { href: "/leaderboard", label: "Board" },
] as const;

// trailingSlash is on, so usePathname returns "/week/". basePath is stripped
// by Next before we see it, so these comparisons stay environment-independent.
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function TabBar() {
  const pathname = usePathname();
  const { signedIn, phase } = useWeek();

  // Two of three tabs lead nowhere useful signed-out, and the board carries
  // its own sign-in call to action instead.
  if (phase === "loading" || !signedIn) return null;

  const current = normalize(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 border-t border-[var(--color-border)] bg-[var(--color-bg)]"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex w-full max-w-md">
        {TABS.map((tab) => {
          const active = current === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 items-center justify-center text-xs font-medium uppercase tracking-widest ${
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Write the route-group layout**

Create `src/app/(app)/layout.tsx`:

```tsx
"use client";

import { WeekProvider } from "@/components/app/WeekProvider";
import { TabBar } from "@/components/app/TabBar";

// `(app)` is a route group: shared layout, no path segment. The pick deck
// deliberately sits outside it — a tab bar under a swipe-driven full-bleed
// card would steal thumb space and put a horizontal target next to a
// horizontal gesture.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WeekProvider>
      {/* pb-28 clears the fixed tab bar; the bar adds the safe-area inset. */}
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6">{children}</main>
      <TabBar />
    </WeekProvider>
  );
}
```

- [ ] **Step 6: Write a placeholder hub so the route resolves**

Create `src/app/(app)/page.tsx`:

```tsx
"use client";

import { useWeek } from "@/components/app/WeekProvider";
import { SignInForm } from "@/components/auth/SignInForm";

export default function Hub() {
  const { phase, signedIn } = useWeek();
  if (phase === "loading") return null;
  if (!signedIn) return <SignInForm />;
  return <p>Hub goes here.</p>;
}
```

- [ ] **Step 7: Verify the build and the route list**

```bash
npm run lint && npx next build
```

Expected: build succeeds, and the route table lists `/` exactly once. A duplicate-route error means Step 2 was skipped.

- [ ] **Step 8: Verify in the browser**

Start the dev server via `preview_start` with a `.claude/launch.json` entry (`npm run dev`, port 3000), then load `http://localhost:3000/`.

Expected signed-out: the magic-link form renders at the root with no redirect, and **no tab bar** is visible.
Expected signed-in: "Hub goes here." with a three-tab bar pinned to the bottom.
Check the console: zero errors.

- [ ] **Step 9: Commit**

```bash
git add src/app src/components/app src/components/auth
git commit -m "feat(nav): route group with shared week provider and bottom tab bar"
```

---

## Task 6: The hub

**Files:**
- Modify: `src/app/(app)/page.tsx` (replace the placeholder)
- Modify: `src/lib/profile.ts`
- Modify: `src/app/welcome/page.tsx:79`

**Interfaces:**
- Consumes: `useWeek()` (Task 5); `hubView`, `verdictOf` (Task 4); `countdownTo`, `formatLockTime` from `@/lib/format`; `isGameComplete` from `@/lib/picks`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Point the landing route at the hub**

In `src/lib/profile.ts`, change the signature and the return:

```ts
export function landingRoute(profile: Profile | null): "/welcome" | "/" {
  if (!profile) return "/welcome";
  if (profile.terms_version !== TERMS_VERSION) return "/welcome";
  return "/";
}
```

In `src/app/welcome/page.tsx`, line 79, change `router.replace("/picks")` to `router.replace("/")`.

- [ ] **Step 2: Write the hub**

Replace the whole contents of `src/app/(app)/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWeek } from "@/components/app/WeekProvider";
import { SignInForm } from "@/components/auth/SignInForm";
import { hubView, type HubView, type Verdict } from "@/lib/hub";
import { isGameComplete } from "@/lib/picks";
import { countdownTo, formatLockTime } from "@/lib/format";

export default function Hub() {
  const { phase, error, signedIn, profile, week, games, results, boardWeek, boardEntries, userId } =
    useWeek();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // A signed-in user with no profile has not finished signing up.
  useEffect(() => {
    if (phase === "ready" && signedIn && !profile) router.replace("/welcome");
  }, [phase, signedIn, profile, router]);

  if (phase === "loading") return <Skeleton />;
  if (phase === "error") {
    return (
      <>
        <Title>Something went wrong</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{error}</p>
      </>
    );
  }
  if (!signedIn) return <SignInForm />;
  if (!profile) return <Skeleton />;

  const completed = games.filter((g) => isGameComplete(results[g.id])).length;
  // The board only carries the current week's entries once it is locked.
  const myEntry =
    boardWeek && week && boardWeek.id === week.id
      ? boardEntries.find((e) => e.user_id === userId) ?? null
      : null;

  const view = hubView({ week, totalGames: games.length, completed, entry: myEntry });

  return (
    <>
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
        {profile.display_name}
      </p>
      <Body view={view} now={now} />
      <Link
        href="/rules"
        className="mt-10 block text-xs text-[var(--color-text-muted)] underline underline-offset-4"
      >
        Official rules
      </Link>
    </>
  );
}

function Body({ view, now }: { view: HubView; now: number }) {
  if (view.kind === "no-week") {
    return (
      <>
        <Title>No week is open yet</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          The first slate has not been loaded. Check back before Sunday.
        </p>
      </>
    );
  }

  if (view.kind === "upcoming") {
    return (
      <>
        <Title>Week {view.week.week_number} lines drop Tuesday</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Every game needs a posted line before picks open. A number that moves
          after you pick against it is a broken promise.
        </p>
        <p className="mt-6 text-xs text-[var(--color-text-muted)]">
          Locks {formatLockTime(view.week.locks_at)}
        </p>
      </>
    );
  }

  if (view.kind === "open") {
    const { label } = countdownTo(view.week.locks_at, now);
    return (
      <>
        <Title>Week {view.week.week_number}</Title>
        <p className="tabular mt-2 text-sm text-[var(--color-accent)]">{label}</p>
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          {view.allIn ? (
            <>
              Every game picked. You can change any of them until{" "}
              {formatLockTime(view.week.locks_at)}.
            </>
          ) : (
            <>
              <span className="tabular text-[var(--color-text)]">
                {view.completed} of {view.totalGames}
              </span>{" "}
              games picked. A partial entry is not scored.
            </>
          )}
        </p>
        <Link
          href="/picks"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          {view.allIn ? "Review your picks" : "Make your picks"}
        </Link>
      </>
    );
  }

  if (view.kind === "locked") {
    return (
      <>
        <Title>Picks are locked</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          All {view.totalGames * 2} of them. Nothing to do now but watch.
        </p>
        <Link
          href="/week"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-semibold"
        >
          See your picks
        </Link>
      </>
    );
  }

  return (
    <>
      <Title>Week {view.week.week_number} final</Title>
      {view.verdict === "no-entry" ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          You did not have a complete set, so this week was not scored for you.
          All {view.possible} picks or nothing.
        </p>
      ) : (
        <>
          <p className="tabular mt-4 font-[family-name:var(--font-display)] text-5xl font-bold">
            {view.correct}
            <span className="text-[var(--color-text-muted)]">/{view.possible}</span>
          </p>
          <VerdictLine verdict={view.verdict} />
        </>
      )}
      <Link
        href="/leaderboard"
        className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-semibold"
      >
        See the board
      </Link>
    </>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict }) {
  if (verdict === "perfect") {
    return (
      <p className="mt-2 text-sm font-semibold text-[var(--color-correct)]">
        Perfect week. Every single one.
      </p>
    );
  }
  if (verdict === "alive") {
    return (
      <p className="mt-2 text-sm font-semibold text-[var(--color-correct)]">
        Still alive.
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
      Busted. There is always next week.
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-[family-name:var(--font-display)] mt-1 text-3xl font-bold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="h-3 w-24 rounded bg-[var(--color-surface)]" />
      <div className="mt-3 h-9 w-2/3 rounded bg-[var(--color-surface)]" />
      <div className="mt-4 h-4 w-full rounded bg-[var(--color-surface)]" />
      <div className="mt-8 h-14 w-full rounded-[var(--radius-target)] bg-[var(--color-surface)]" />
    </div>
  );
}
```

- [ ] **Step 3: Verify tests, lint, and build**

```bash
npm test && npm run lint && npx next build
```

Expected: 20 tests pass, no lint errors, build succeeds.

- [ ] **Step 4: Verify each hub state against the live database**

With the dev server running and signed in as a real user, drive the week through its states via `mcp__supabase__execute_sql` and reload the hub after each:

```sql
update public.weeks set status = 'open'     where id = 2;  -- expect progress + CTA
update public.weeks set status = 'upcoming' where id = 2;  -- expect "lines drop Tuesday"
update public.weeks set status = 'locked'   where id = 2;  -- expect "Picks are locked"
update public.weeks set status = 'open'     where id = 2;  -- leave it open
```

The `scored` state has no entries yet and is verified end to end in Task 9. Confirm the console stays free of errors throughout.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/page.tsx" src/lib/profile.ts src/app/welcome/page.tsx
git commit -m "feat(hub): landing screen covering every week state"
```

---

## Task 7: PickSummaryRow and My Week

**Files:**
- Create: `src/components/week/PickSummaryRow.tsx`
- Create: `src/app/(app)/week/page.tsx`
- Modify: `src/components/picks/ReviewScreen.tsx`

**Interfaces:**
- Consumes: `Game` from `@/lib/week`; `Pick` from `@/lib/picks`; `lineFor`, `formatTotal`, `formatKickoff` from `@/lib/format`.
- Produces: `<PickSummaryRow index game pick grade? score? onJump? />` where `grade?: { total: boolean | null; spread: boolean | null }` and `score?: { home: number | null; away: number | null }`.

`ReviewScreen` already renders a pick summary row and My Week needs the same row with grades attached. Extracting it means a line-format change touches one file — the last format change touched five copy strings across the app.

Scope is the extraction only. No other change to `ReviewScreen`'s behaviour or copy.

- [ ] **Step 1: Write the shared row**

Create `src/components/week/PickSummaryRow.tsx`:

```tsx
"use client";

import { lineFor, formatKickoff, formatTotal } from "@/lib/format";
import type { Pick } from "@/lib/picks";
import type { Game } from "@/lib/week";

export type Grade = { total: boolean | null; spread: boolean | null };
export type Score = { home: number | null; away: number | null };

type Props = {
  index: number;
  game: Game;
  pick: Pick | undefined;
  /** Omitted before scoring. A null field means that side is not graded yet. */
  grade?: Grade;
  score?: Score;
  /** Supplied by the review screen, where a row jumps back to its card. */
  onJump?: () => void;
};

/**
 * One game's line in a list of picks. Shared by the review screen and My Week
 * so the two cannot drift apart the next time a line format changes.
 */
export function PickSummaryRow({ index, game, pick, grade, score, onJump }: Props) {
  const complete = Boolean(pick?.total && pick?.spread);

  const body = (
    <>
      <span className="tabular w-6 shrink-0 text-xs text-[var(--color-text-muted)]">
        {index + 1}
      </span>
      <span className="font-[family-name:var(--font-display)] w-28 shrink-0 text-base font-semibold uppercase">
        {game.away_team} @ {game.home_team}
      </span>
      <span className="min-w-0 flex-1 text-xs text-[var(--color-text-muted)]">
        {complete ? (
          <>
            <Mark correct={grade?.total} />
            <span className="text-[var(--color-text)]">
              {pick!.total === "OVER" ? "Over" : "Under"}
            </span>{" "}
            <span className="tabular">{formatTotal(game.total)}</span> ·{" "}
            <Mark correct={grade?.spread} />
            <span className="text-[var(--color-text)]">{pick!.spread}</span>{" "}
            <span className="tabular">
              {lineFor(game.spread, pick!.spread === game.home_team ? "home" : "away")}
            </span>
            {score && score.home !== null && score.away !== null && (
              <span className="tabular block text-[var(--color-text-muted)]">
                Final {score.away}–{score.home}
              </span>
            )}
          </>
        ) : (
          <span>Not picked · {formatKickoff(game.kickoff_at)}</span>
        )}
      </span>
    </>
  );

  if (onJump) {
    return (
      <li>
        <button
          type="button"
          onClick={onJump}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          {body}
        </button>
      </li>
    );
  }

  return <li className="flex items-center gap-3 px-4 py-3">{body}</li>;
}

/**
 * A push — a combined score landing exactly on the total, or a spread landing
 * exactly on the number — is recorded as correct for both sides. It shows a
 * check, not a third state: inventing one here would contradict both the
 * database and the rules page.
 */
function Mark({ correct }: { correct?: boolean | null }) {
  if (correct === undefined || correct === null) return null;
  return (
    <span
      aria-label={correct ? "correct" : "wrong"}
      className={`mr-1 ${correct ? "text-[var(--color-correct)]" : "text-[var(--color-wrong)]"}`}
    >
      {correct ? "✓" : "✗"}
    </span>
  );
}
```

- [ ] **Step 2: Use it from ReviewScreen**

In `src/components/picks/ReviewScreen.tsx`:

Add the import:

```ts
import { PickSummaryRow } from "@/components/week/PickSummaryRow";
```

Replace the entire `<ul>…</ul>` block — from `<ul className="mt-5 divide-y …">` through its closing `</ul>` — with:

```tsx
      <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {games.map((game, index) => (
          <PickSummaryRow
            key={game.id}
            index={index}
            game={game}
            pick={picks[game.id]}
            onJump={() => onJump(index)}
          />
        ))}
      </ul>
```

Then delete the now-unused imports `lineFor`, `formatKickoff`, `formatTotal` from the top of the file — `isGameComplete` is still used by `missing`, so keep it. Lint will flag any that are wrong.

- [ ] **Step 3: Verify the review screen is visually unchanged**

```bash
npm run lint && npx next build
```

Then in the browser, sign in, go to `/picks`, swipe to the review screen. Rows must look **identical** to before: number, `AWAY @ HOME`, `Over 44.5 · CIN -3.5`, tapping a row jumps to that card. No check or cross appears — the review screen passes no `grade`.

- [ ] **Step 4: Commit the extraction on its own**

```bash
git add src/components/week/PickSummaryRow.tsx src/components/picks/ReviewScreen.tsx
git commit -m "refactor: share the pick summary row between review and My Week"
```

- [ ] **Step 5: Write My Week**

Create `src/app/(app)/week/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useWeek } from "@/components/app/WeekProvider";
import { PickSummaryRow } from "@/components/week/PickSummaryRow";
import { formatLockTime } from "@/lib/format";

export default function MyWeek() {
  const { phase, error, signedIn, week, games, results } = useWeek();

  if (phase === "loading") return <Skeleton />;
  if (phase === "error") {
    return (
      <>
        <Title>Something went wrong</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{error}</p>
      </>
    );
  }

  if (!signedIn) {
    return (
      <>
        <Title>Your week</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Sign in to see your picks.
        </p>
        <Link
          href="/"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          Sign in
        </Link>
      </>
    );
  }

  if (!week || games.length === 0) {
    return (
      <>
        <Title>Your week</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          No slate is posted yet, so there is nothing to show.
        </p>
      </>
    );
  }

  const graded = week.status === "scored";
  const picked = games.filter((g) => results[g.id]?.total && results[g.id]?.spread).length;

  return (
    <>
      <Title>Week {week.week_number}</Title>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {graded ? (
          "Final. A push counts for both sides."
        ) : week.status === "locked" ? (
          "Locked. Grades appear as games finish."
        ) : (
          <>
            <span className="tabular text-[var(--color-text)]">
              {picked} of {games.length}
            </span>{" "}
            picked · locks {formatLockTime(week.locks_at)}
          </>
        )}
      </p>

      {/* Kickoff order, the same order as the deck and the share grid. It is
          what lets two people line their lists up row by row. */}
      <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {games.map((game, index) => {
          const result = results[game.id];
          return (
            <PickSummaryRow
              key={game.id}
              index={index}
              game={game}
              pick={result}
              grade={
                result
                  ? { total: result.totalCorrect, spread: result.spreadCorrect }
                  : undefined
              }
              score={
                game.status === "final"
                  ? { home: game.home_score, away: game.away_score }
                  : undefined
              }
            />
          );
        })}
      </ul>

      {week.status === "open" && (
        <Link
          href="/picks"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          {picked === games.length ? "Change a pick" : "Finish your picks"}
        </Link>
      )}
    </>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="h-9 w-1/2 rounded bg-[var(--color-surface)]" />
      <div className="mt-3 h-4 w-2/3 rounded bg-[var(--color-surface)]" />
      <div className="mt-5 h-96 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

```bash
npm test && npm run lint && npx next build
```

Then in the browser: `/week` signed in shows sixteen rows in kickoff order, matching the deck's order exactly, with no marks (the week is open and ungraded). Signed out, it shows the sign-in call to action. Console clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/week"
git commit -m "feat(week): My Week screen with graded picks and final scores"
```

---

## Task 8: The leaderboard

**Files:**
- Create: `src/app/(app)/leaderboard/page.tsx`

**Interfaces:**
- Consumes: `useWeek()` (Task 5); `rankEntries` (Task 1); `countdownTo`, `formatLockTime` from `@/lib/format`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the board**

Create `src/app/(app)/leaderboard/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWeek } from "@/components/app/WeekProvider";
import { rankEntries } from "@/lib/leaderboard";
import { countdownTo, formatLockTime } from "@/lib/format";

export default function Leaderboard() {
  const { phase, error, signedIn, userId, week, boardWeek, boardEntries } = useWeek();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (phase === "loading") return <Skeleton />;
  if (phase === "error") {
    return (
      <>
        <Title>Something went wrong</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{error}</p>
      </>
    );
  }

  const ranked = rankEntries(boardEntries);
  const showsCurrent = boardWeek !== null && week !== null && boardWeek.id === week.id;
  // The chip means nothing before lock: everyone is trivially alive.
  const showChips =
    showsCurrent && (week.status === "locked" || week.status === "scored");

  return (
    <>
      <Title>{boardWeek ? `Week ${boardWeek.week_number}` : "Leaderboard"}</Title>

      {!showsCurrent && week && (week.status === "open" || week.status === "upcoming") && (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Standings open when picks lock —{" "}
          <span className="tabular text-[var(--color-accent)]">
            {countdownTo(week.locks_at, now).label}
          </span>
          . Entries are created at lock, and only for a complete set.
        </p>
      )}

      {!showsCurrent && boardWeek && (
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Last week&rsquo;s final standings
        </p>
      )}

      {ranked.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          {week
            ? `Nobody is on the board yet. Locks ${formatLockTime(week.locks_at)}.`
            : "No week has been played yet."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {ranked.map((row) => {
            const mine = row.user_id === userId;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  mine ? "bg-[var(--color-surface-raised)]" : ""
                }`}
              >
                <span className="tabular w-6 shrink-0 text-sm text-[var(--color-text-muted)]">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                  {row.display_name}
                  {mine && (
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">you</span>
                  )}
                </span>
                {showChips && <Chip perfect={row.is_perfect} alive={row.is_alive} />}
                <span className="tabular w-14 shrink-0 text-right text-sm">
                  {row.correct_count}
                  <span className="text-[var(--color-text-muted)]">/{row.picks_possible}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!signedIn && (
        <Link
          href="/"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          Sign in to play
        </Link>
      )}
    </>
  );
}

function Chip({ perfect, alive }: { perfect: boolean; alive: boolean }) {
  if (perfect) {
    return (
      <span className="shrink-0 text-xs font-semibold uppercase text-[var(--color-correct)]">
        Perfect
      </span>
    );
  }
  if (alive) {
    return (
      <span className="shrink-0 text-xs font-semibold uppercase text-[var(--color-correct)]">
        Alive
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs uppercase text-[var(--color-text-muted)]">Out</span>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="h-9 w-1/2 rounded bg-[var(--color-surface)]" />
      <div className="mt-5 h-40 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
    </div>
  );
}
```

- [ ] **Step 2: Verify signed out — this is the test of migration 0012**

```bash
npm run lint && npx next build
```

Open `/leaderboard/` in a **private window** (no session). Expected: the page renders with the pre-lock countdown copy and a "Sign in to play" button, **no tab bar**, and **zero console errors**. A PostgREST permission error here means migration 0012 did not apply.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/leaderboard"
git commit -m "feat(leaderboard): public weekly standings with tie-aware ranking"
```

---

## Task 9: Deck exit, end-to-end scored run, and deploy

**Files:**
- Modify: `src/app/picks/page.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: the deployed site.

- [ ] **Step 1: Give the deck a way back**

In `src/app/picks/page.tsx`, add the import:

```ts
import Link from "next/link";
```

Then, in the final `return (<> … </>)` block, insert directly above `<PickDeck`:

```tsx
      <div className="mx-auto w-full max-w-md px-4 pt-4">
        <Link
          href="/"
          className="text-sm text-[var(--color-text-muted)] underline underline-offset-4"
        >
          ← Back
        </Link>
      </div>
```

The deck stays outside the tab bar, so without this a user who opens it can only leave with the browser's back gesture.

- [ ] **Step 2: Run the whole end-to-end scored week**

This is the only run that exercises the `scored` hub state, the grade marks on My Week, and a populated board. Run each block through `mcp__supabase__execute_sql`, reloading the app between steps.

Lock the week and create entries:

```sql
select private.lock_week(2);
```

Expected: returns `1` — only Harry S has a complete set. Reload: hub shows "Picks are locked", `/leaderboard` shows one row with an "Alive" chip and `0/32`.

Enter final scores for the whole slate:

```sql
select private.set_final_score(2, g.external_id, 24, 20)
from public.games g where g.week_id = 2;
```

Grade it:

```sql
select * from private.score_week(2);
```

Reload and confirm:
- Hub shows `Week 18 final`, a record out of 32, and a verdict line.
- `/week` shows a ✓ or ✗ against every pick and `Final 20–24` under each row.
- `/leaderboard` shows the ranked board with an Out or Alive chip.

- [ ] **Step 3: Reset the demo week**

```sql
update public.picks set total_correct = null, spread_correct = null;
delete from public.entries where week_id = 2;
update public.games set home_score = null, away_score = null, status = 'scheduled'
where week_id = 2;
update public.weeks set status = 'open' where id = 2;
```

Note the week id is **2**, not the `1` currently written in `supabase/OPERATIONS.md` — that document's bug is recorded in §11 of the spec and is not fixed here.

Reload and confirm the hub is back to the open state with the pick CTA.

- [ ] **Step 4: Full verification**

```bash
npm test && npm run lint && npx next build
```

Expected: 20 tests pass, no lint errors, build succeeds. Confirm the build output lists `/`, `/week/`, `/leaderboard/`, `/picks/`, `/rules/`, `/welcome/`, and `/auth/callback/`.

- [ ] **Step 5: Confirm no stale route references remain**

```bash
grep -rn '"/picks"' src/ | grep -v 'href="/picks"'
```

Expected: no output. Every remaining `/picks` reference should be a `Link href`, not a redirect target — `landingRoute` and the welcome page now send users to `/`.

- [ ] **Step 6: Commit and deploy**

```bash
git add src/app/picks/page.tsx
git commit -m "feat(picks): exit back to the hub"
git push origin main
```

Watch the run:

```bash
gh run watch
```

- [ ] **Step 7: Verify the live deployment**

Load `https://saroldhand.github.io/perfect-sunday/` signed out and confirm the sign-in form renders at the root. Load `https://saroldhand.github.io/perfect-sunday/leaderboard/` signed out and confirm the board renders with no console errors — this proves the public read works against the deployed bundle, not just in dev.

Then confirm every asset resolved under the basePath:

```bash
curl -sI https://saroldhand.github.io/perfect-sunday/week/ | head -1
```

Expected: `HTTP/2 200`.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3 routes, route group, root changes role | 5, 6 |
| §3 no `/signin` route, form becomes a component | 5 (Step 1) |
| §3 signed-out on a public route | 8 (Step 2) |
| §4 WeekProvider | 5 |
| §4 new and changed queries | 3 |
| §5 hub by week state | 4, 6 |
| §6 My Week, kickoff order, push handling | 7 |
| §6 PickSummaryRow extraction | 7 (Steps 1–4) |
| §7 leaderboard, ranking, ties, chips, pre-lock | 1, 8 |
| §8 migration 0012 | 2 |
| §9 tests 11 and 12, README | 2 |
| §10 out of scope | not built — no task, correct |
| §11 known issues | not fixed — noted in Task 9 Step 3 |

**Type consistency:** `EntryRow` is defined once in `leaderboard.ts` and imported by `entries.ts`, `hub.ts`, and `WeekProvider.tsx`. The provider exposes `results` (a `ResultMap`), and both the hub and My Week read `results[game.id]`. `Result` extends `Pick`, so passing a `Result` where `PickSummaryRow` expects `Pick | undefined` type-checks. `hubView` takes `{ week, totalGames, completed, entry }` in Task 4 and is called with exactly those four keys in Task 6.

**Note on a naming collision:** `src/lib/picks.ts` already exports a type named `PickRow` (a database row) and `src/components/picks/GameCard.tsx` has an internal component named `PickRow`. The new shared component is deliberately named `PickSummaryRow` to collide with neither.
