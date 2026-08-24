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
