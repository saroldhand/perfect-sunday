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
