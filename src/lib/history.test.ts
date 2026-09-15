import { describe, expect, it } from "vitest";
import { spansSeasons, toHistoryWeeks, type RawHistoryPick } from "@/lib/history";
import type { Game, Week } from "@/lib/week";

const NOW = Date.parse("2026-09-15T17:00:00Z");

function week(over: Partial<Week> & { id: number }): Week {
  return {
    season: 2026,
    week_number: 1,
    locks_at: "2026-09-09T23:50:00Z",
    status: "scored",
    ...over,
  };
}

function game(over: Partial<Game> & { id: string }): Game {
  return {
    home_team: "SEA",
    away_team: "NE",
    kickoff_at: "2026-09-10T00:20:00Z",
    spread: -3.5,
    total: 44.5,
    over_odds: -110,
    under_odds: -110,
    home_score: null,
    away_score: null,
    status: "final",
    ...over,
  };
}

function row(
  gameOver: Partial<Game> & { id: string },
  weekOver: Partial<Week> & { id: number },
  pick: Partial<RawHistoryPick> = {},
): RawHistoryPick {
  return {
    game_id: gameOver.id,
    total_pick: "OVER",
    spread_pick: "SEA",
    total_correct: null,
    spread_correct: null,
    ...pick,
    games: { ...game(gameOver), weeks: week(weekOver) },
  };
}

describe("toHistoryWeeks", () => {
  it("groups picks by their week", () => {
    const weeks = toHistoryWeeks(
      [
        row({ id: "a" }, { id: 3, week_number: 1 }),
        row({ id: "b" }, { id: 3, week_number: 1 }),
        row({ id: "c" }, { id: 2, week_number: 18, season: 2025, locks_at: "2026-09-10T20:00:00Z" }),
      ],
      NOW,
    );

    expect(weeks).toHaveLength(2);
    expect(weeks.map((w) => w.week.id)).toEqual([2, 3]);
    expect(weeks.find((w) => w.week.id === 3)?.games).toHaveLength(2);
  });

  it("carries each pick and its grade through", () => {
    const [entry] = toHistoryWeeks(
      [
        row({ id: "a" }, { id: 3 }, {
          total_pick: "UNDER",
          spread_pick: "NE",
          total_correct: true,
          spread_correct: false,
        }),
      ],
      NOW,
    );

    expect(entry.results.a).toEqual({
      total: "UNDER",
      spread: "NE",
      totalCorrect: true,
      spreadCorrect: false,
    });
  });

  it("orders weeks newest first, across seasons", () => {
    const weeks = toHistoryWeeks(
      [
        row({ id: "a" }, { id: 2, season: 2025, week_number: 18, locks_at: "2026-09-10T20:00:00Z" }),
        row({ id: "b" }, { id: 3, season: 2026, week_number: 1, locks_at: "2026-09-09T23:50:00Z" }),
      ],
      NOW,
    );

    // Week 18 of 2025 locked *after* week 1 of 2026 here, which is exactly the
    // case a week-number sort would get wrong.
    expect(weeks.map((w) => [w.week.season, w.week.week_number])).toEqual([
      [2025, 18],
      [2026, 1],
    ]);
  });

  it("orders games within a week by kickoff", () => {
    const [entry] = toHistoryWeeks(
      [
        row({ id: "late", kickoff_at: "2026-09-14T00:20:00Z" }, { id: 3 }),
        row({ id: "early", kickoff_at: "2026-09-10T00:20:00Z" }, { id: 3 }),
      ],
      NOW,
    );

    expect(entry.games.map((g) => g.id)).toEqual(["early", "late"]);
  });

  it("breaks a shared kickoff by id, so the order is stable", () => {
    const [entry] = toHistoryWeeks(
      [
        row({ id: "b", kickoff_at: "2026-09-13T17:00:00Z" }, { id: 3 }),
        row({ id: "a", kickoff_at: "2026-09-13T17:00:00Z" }, { id: 3 }),
      ],
      NOW,
    );

    expect(entry.games.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("leaves out a week that has not locked yet", () => {
    const weeks = toHistoryWeeks(
      [row({ id: "a" }, { id: 4, week_number: 2, locks_at: "2026-09-17T20:00:00Z", status: "open" })],
      NOW,
    );

    expect(weeks).toEqual([]);
  });

  it("includes a past week that was never locked — the demo week", () => {
    const weeks = toHistoryWeeks(
      [
        row({ id: "a" }, {
          id: 2,
          season: 2025,
          week_number: 18,
          locks_at: "2026-09-10T20:00:00Z",
          status: "upcoming",
        }),
      ],
      NOW,
    );

    expect(weeks).toHaveLength(1);
    expect(weeks[0].week.status).toBe("upcoming");
  });

  it("leaves out the week My Week is already showing", () => {
    const rows = [
      row({ id: "a" }, { id: 3, week_number: 1 }),
      row({ id: "b" }, { id: 2, week_number: 18, season: 2025, locks_at: "2026-09-10T20:00:00Z" }),
    ];

    expect(toHistoryWeeks(rows, NOW, 3).map((w) => w.week.id)).toEqual([2]);
  });

  it("drops a row whose embed is missing rather than guessing", () => {
    const orphanGame: RawHistoryPick = {
      game_id: "a",
      total_pick: "OVER",
      spread_pick: "SEA",
      total_correct: null,
      spread_correct: null,
      games: null,
    };
    const orphanWeek: RawHistoryPick = {
      ...row({ id: "b" }, { id: 3 }),
      games: { ...game({ id: "b" }), weeks: null },
    };

    expect(toHistoryWeeks([orphanGame, orphanWeek], NOW)).toEqual([]);
  });

  it("does not leak the embedded week onto the game", () => {
    const [entry] = toHistoryWeeks([row({ id: "a" }, { id: 3 })], NOW);
    expect("weeks" in entry.games[0]).toBe(false);
  });

  it("is empty for someone who has never picked", () => {
    expect(toHistoryWeeks([], NOW)).toEqual([]);
  });
});

describe("spansSeasons", () => {
  it("is false within one season", () => {
    const weeks = toHistoryWeeks(
      [
        row({ id: "a" }, { id: 3, week_number: 1 }),
        row({ id: "b" }, { id: 4, week_number: 2, locks_at: "2026-09-11T20:00:00Z" }),
      ],
      NOW,
    );

    expect(spansSeasons(weeks)).toBe(false);
  });

  it("is true once two seasons are in view", () => {
    const weeks = toHistoryWeeks(
      [
        row({ id: "a" }, { id: 3, week_number: 1 }),
        row({ id: "b" }, { id: 2, season: 2025, week_number: 18, locks_at: "2026-09-10T20:00:00Z" }),
      ],
      NOW,
    );

    expect(spansSeasons(weeks)).toBe(true);
  });

  it("is false on an empty list", () => {
    expect(spansSeasons([])).toBe(false);
  });
});
