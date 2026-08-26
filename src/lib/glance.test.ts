import { describe, expect, it } from "vitest";
import { buildGlance, describePips } from "@/lib/glance";
import type { Game } from "@/lib/week";
import type { ResultMap } from "@/lib/picks";

function game(id: string): Game {
  return {
    id,
    home_team: "TB",
    away_team: "CAR",
    kickoff_at: "2026-09-13T17:00:00Z",
    spread: -3.5,
    total: 44.5,
    over_odds: -110,
    under_odds: -110,
    home_score: null,
    away_score: null,
    status: "scheduled",
  };
}

const games = [game("a"), game("b"), game("c")];

describe("buildGlance", () => {
  it("shows a game with no pick as empty on both rows", () => {
    const glance = buildGlance([game("a")], {});

    expect(glance.totals).toEqual(["empty"]);
    expect(glance.spreads).toEqual(["empty"]);
  });

  it("shows an ungraded pick as picked rather than as an outcome", () => {
    const results: ResultMap = {
      a: { total: "OVER", spread: "TB", totalCorrect: null, spreadCorrect: null },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["picked"]);
    expect(glance.spreads).toEqual(["picked"]);
  });

  it("grades the two rows independently", () => {
    const results: ResultMap = {
      a: { total: "OVER", spread: "TB", totalCorrect: true, spreadCorrect: false },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["correct"]);
    expect(glance.spreads).toEqual(["wrong"]);
  });

  it("leaves the unpicked side of a half-finished game empty", () => {
    const results: ResultMap = {
      a: { total: "UNDER", spread: null, totalCorrect: null, spreadCorrect: null },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["picked"]);
    expect(glance.spreads).toEqual(["empty"]);
  });

  // A grade against a side that was never picked cannot happen through the
  // product, but a pip claiming an outcome for a pick the user never made
  // would be the worst thing this strip could say, so it stays empty.
  it("keeps an unpicked side empty even if a grade came back for it", () => {
    const results: ResultMap = {
      a: { total: null, spread: "TB", totalCorrect: true, spreadCorrect: true },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["empty"]);
  });

  // The strip only means anything if its columns line up with the rows below
  // it and with the shared grid, and all three are built from `games`.
  it("emits one pip per game in the order the games arrive", () => {
    const results: ResultMap = {
      a: { total: "OVER", spread: null, totalCorrect: null, spreadCorrect: null },
      c: { total: "UNDER", spread: null, totalCorrect: false, spreadCorrect: null },
    };

    const glance = buildGlance(games, results);

    expect(glance.totals).toEqual(["picked", "empty", "wrong"]);
  });

  it("counts every individual pick against two per game", () => {
    const results: ResultMap = {
      a: { total: "OVER", spread: "TB", totalCorrect: null, spreadCorrect: null },
      b: { total: "UNDER", spread: null, totalCorrect: null, spreadCorrect: null },
    };

    const glance = buildGlance(games, results);

    expect(glance.picked).toBe(3);
    expect(glance.possible).toBe(6);
  });

  it("counts correct picks against what has actually been graded", () => {
    const results: ResultMap = {
      a: { total: "OVER", spread: "TB", totalCorrect: true, spreadCorrect: false },
      b: { total: "UNDER", spread: "CAR", totalCorrect: true, spreadCorrect: null },
    };

    const glance = buildGlance(games, results);

    expect(glance.correct).toBe(2);
    expect(glance.graded).toBe(3);
  });

  it("returns empty rows for an empty slate", () => {
    const glance = buildGlance([], {});

    expect(glance).toEqual({
      totals: [],
      spreads: [],
      picked: 0,
      possible: 0,
      correct: 0,
      graded: 0,
    });
  });
});

describe("describePips", () => {
  it("names each state present with its count", () => {
    const text = describePips("Totals", ["correct", "wrong", "picked", "empty"]);

    expect(text).toBe("Totals: 1 correct, 1 wrong, 1 not graded, 1 not picked");
  });

  it("leaves out states with no pips", () => {
    const text = describePips("Spreads", ["correct", "correct", "wrong"]);

    expect(text).toBe("Spreads: 2 correct, 1 wrong");
  });

  it("says so plainly when nothing has been picked", () => {
    const text = describePips("Totals", ["empty", "empty"]);

    expect(text).toBe("Totals: none picked yet");
  });

  it("says so plainly when there is no slate at all", () => {
    expect(describePips("Totals", [])).toBe("Totals: none picked yet");
  });
});
