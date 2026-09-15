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
    moneyline_home: -180,
    moneyline_away: 155,
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
    expect(glance.moneylines).toEqual(["empty"]);
  });

  it("shows an ungraded pick as picked rather than as an outcome", () => {
    const results: ResultMap = {
      a: { total: "OVER", moneyline: "TB", totalCorrect: null, moneylineCorrect: null },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["picked"]);
    expect(glance.moneylines).toEqual(["picked"]);
  });

  it("grades the two rows independently", () => {
    const results: ResultMap = {
      a: { total: "OVER", moneyline: "TB", totalCorrect: true, moneylineCorrect: false },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["correct"]);
    expect(glance.moneylines).toEqual(["wrong"]);
  });

  it("leaves the unpicked side of a half-finished game empty", () => {
    const results: ResultMap = {
      a: { total: "UNDER", moneyline: null, totalCorrect: null, moneylineCorrect: null },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["picked"]);
    expect(glance.moneylines).toEqual(["empty"]);
  });

  // A grade against a side that was never picked cannot happen through the
  // product, but a pip claiming an outcome for a pick the user never made
  // would be the worst thing this strip could say, so it stays empty.
  it("keeps an unpicked side empty even if a grade came back for it", () => {
    const results: ResultMap = {
      a: { total: null, moneyline: "TB", totalCorrect: true, moneylineCorrect: true },
    };

    const glance = buildGlance([game("a")], results);

    expect(glance.totals).toEqual(["empty"]);
  });

  // The strip only means anything if its columns line up with the rows below
  // it and with the shared grid, and all three are built from `games`.
  it("emits one pip per game in the order the games arrive", () => {
    const results: ResultMap = {
      a: { total: "OVER", moneyline: null, totalCorrect: null, moneylineCorrect: null },
      c: { total: "UNDER", moneyline: null, totalCorrect: false, moneylineCorrect: null },
    };

    const glance = buildGlance(games, results);

    expect(glance.totals).toEqual(["picked", "empty", "wrong"]);
  });

  it("counts every individual pick against two per game", () => {
    const results: ResultMap = {
      a: { total: "OVER", moneyline: "TB", totalCorrect: null, moneylineCorrect: null },
      b: { total: "UNDER", moneyline: null, totalCorrect: null, moneylineCorrect: null },
    };

    const glance = buildGlance(games, results);

    expect(glance.picked).toBe(3);
    expect(glance.possible).toBe(6);
  });

  it("counts correct picks against what has actually been graded", () => {
    const results: ResultMap = {
      a: { total: "OVER", moneyline: "TB", totalCorrect: true, moneylineCorrect: false },
      b: { total: "UNDER", moneyline: "CAR", totalCorrect: true, moneylineCorrect: null },
    };

    const glance = buildGlance(games, results);

    expect(glance.correct).toBe(2);
    expect(glance.graded).toBe(3);
  });

  it("returns empty rows for an empty slate", () => {
    const glance = buildGlance([], {});

    expect(glance).toEqual({
      totals: [],
      moneylines: [],
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
    const text = describePips("Moneylines", ["correct", "correct", "wrong"]);

    expect(text).toBe("Moneylines: 2 correct, 1 wrong");
  });

  it("says so plainly when nothing has been picked", () => {
    const text = describePips("Totals", ["empty", "empty"]);

    expect(text).toBe("Totals: none picked yet");
  });

  it("says so plainly when there is no slate at all", () => {
    expect(describePips("Totals", [])).toBe("Totals: none picked yet");
  });
});
