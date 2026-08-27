import { describe, expect, it } from "vitest";
import {
  seasonStandings,
  throughWeek,
  toSeasonEntries,
  type RawSeasonEntry,
  type SeasonEntry,
} from "@/lib/season";

function entry(overrides: Partial<SeasonEntry>): SeasonEntry {
  return {
    user_id: "u1",
    display_name: "Ann",
    week_number: 1,
    correct_count: 20,
    picks_possible: 32,
    is_perfect: false,
    ...overrides,
  };
}

describe("seasonStandings", () => {
  it("is empty on an empty season", () => {
    expect(seasonStandings([])).toEqual([]);
  });

  it("sums a player's weeks: totals, best week, perfect weeks", () => {
    const rows = seasonStandings([
      entry({ week_number: 1, correct_count: 20 }),
      entry({ week_number: 2, correct_count: 32, is_perfect: true }),
      entry({ week_number: 3, correct_count: 25 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      total_correct: 77,
      total_possible: 96,
      weeks_played: 3,
      best_week: 32,
      perfect_weeks: 1,
      rank: 1,
    });
  });

  it("orders by total correct first", () => {
    const rows = seasonStandings([
      entry({ user_id: "a", display_name: "Ann", correct_count: 18 }),
      entry({ user_id: "b", display_name: "Bob", correct_count: 24 }),
    ]);
    expect(rows.map((r) => r.display_name)).toEqual(["Bob", "Ann"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("breaks a total tie on weeks played, and that breaks the rank too", () => {
    // 40 correct each, but Ann showed up three weeks to Bob's two. SPEC §4:
    // the tiebreak rewards consistency, so Ann is 1st and Bob 2nd, not tied.
    const rows = seasonStandings([
      entry({ user_id: "a", display_name: "Ann", week_number: 1, correct_count: 10 }),
      entry({ user_id: "a", display_name: "Ann", week_number: 2, correct_count: 10 }),
      entry({ user_id: "a", display_name: "Ann", week_number: 3, correct_count: 20 }),
      entry({ user_id: "b", display_name: "Bob", week_number: 1, correct_count: 20 }),
      entry({ user_id: "b", display_name: "Bob", week_number: 2, correct_count: 20 }),
    ]);
    expect(rows.map((r) => r.display_name)).toEqual(["Ann", "Bob"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("shares a rank only on total and weeks alike, and skips the next", () => {
    const rows = seasonStandings([
      entry({ user_id: "a", display_name: "Ann", week_number: 1, correct_count: 20 }),
      entry({ user_id: "b", display_name: "Bob", week_number: 1, correct_count: 20 }),
      entry({ user_id: "c", display_name: "Cal", week_number: 1, correct_count: 15 }),
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    // Tied pair in name order so the table is reproducible between loads.
    expect(rows.map((r) => r.display_name)).toEqual(["Ann", "Bob", "Cal"]);
  });
});

describe("throughWeek", () => {
  it("reports the latest week summed in, zero when empty", () => {
    expect(throughWeek([])).toBe(0);
    expect(
      throughWeek([entry({ week_number: 3 }), entry({ week_number: 1 })]),
    ).toBe(3);
  });
});

describe("toSeasonEntries", () => {
  const raw: RawSeasonEntry = {
    user_id: "u1",
    correct_count: 20,
    picks_possible: 32,
    is_perfect: false,
    weeks: { week_number: 4 },
    profiles: { display_name: "Ann" },
  };

  it("flattens the embeds", () => {
    expect(toSeasonEntries([raw])).toEqual([
      entry({ week_number: 4, correct_count: 20 }),
    ]);
  });

  it("degrades a missing profile to a placeholder, not a blank line", () => {
    expect(toSeasonEntries([{ ...raw, profiles: null }])[0].display_name).toBe(
      "Unknown player",
    );
  });

  it("drops a row with no week to attribute it to", () => {
    expect(toSeasonEntries([{ ...raw, weeks: null }])).toEqual([]);
  });
});
