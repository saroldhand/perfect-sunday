import { describe, expect, it } from "vitest";
import { IDLE_POLL_MS, LIVE_POLL_MS, pollDelay } from "@/lib/refresh";
import type { Game, Week, WeekStatus } from "@/lib/week";

const NOW = Date.parse("2026-09-13T18:00:00Z"); // Sunday afternoon ET

function week(status: WeekStatus): Week {
  return {
    id: 1,
    season: 2026,
    week_number: 1,
    locks_at: "2026-09-09T23:50:00Z",
    status,
  };
}

function game(overrides: Partial<Game>): Game {
  return {
    id: crypto.randomUUID(),
    home_team: "SEA",
    away_team: "NE",
    kickoff_at: "2026-09-13T17:00:00Z",
    spread: -3.5,
    total: 44.5,
    over_odds: -110,
    under_odds: -110,
    home_score: null,
    away_score: null,
    status: "scheduled",
    ...overrides,
  };
}

describe("pollDelay", () => {
  it("does not poll with no week at all", () => {
    expect(pollDelay(null, [], NOW)).toBeNull();
  });

  it("idles through upcoming, waiting for lines to land", () => {
    expect(pollDelay(week("upcoming"), [game({})], NOW)).toBe(IDLE_POLL_MS);
  });

  it("idles through an open week, waiting for the lock", () => {
    expect(pollDelay(week("open"), [game({})], NOW)).toBe(IDLE_POLL_MS);
  });

  it("idles between the lock and the first kickoff", () => {
    const beforeKickoff = Date.parse("2026-09-11T12:00:00Z"); // Friday
    expect(pollDelay(week("locked"), [game({})], beforeKickoff)).toBe(IDLE_POLL_MS);
  });

  it("polls live once any game has kicked off and is not final", () => {
    const games = [
      game({ kickoff_at: "2026-09-13T17:00:00Z", status: "in_progress" }),
      game({ kickoff_at: "2026-09-13T20:25:00Z" }),
    ];
    expect(pollDelay(week("locked"), games, NOW)).toBe(LIVE_POLL_MS);
  });

  it("polls live between windows: the early game is final, the late one has not started", () => {
    // 5pm ET Sunday. The 1pm game is final, the 4:25 has not kicked off, but
    // the slate as a whole is under way — a resolved-but-unscored sweep or a
    // week flip can land at any time.
    const between = Date.parse("2026-09-13T21:00:00Z");
    const games = [
      game({ kickoff_at: "2026-09-13T17:00:00Z", status: "final" }),
      game({ kickoff_at: "2026-09-13T21:25:00Z" }),
    ];
    expect(pollDelay(week("locked"), games, between)).toBe(LIVE_POLL_MS);
  });

  it("drops back to idle once every game is final, waiting on the scoring job", () => {
    const games = [game({ status: "final" }), game({ status: "final" })];
    expect(pollDelay(week("locked"), games, NOW)).toBe(IDLE_POLL_MS);
  });

  it("stops polling a scored week", () => {
    expect(pollDelay(week("scored"), [game({ status: "final" })], NOW)).toBeNull();
  });
});
