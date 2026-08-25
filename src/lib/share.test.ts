import { describe, expect, it } from "vitest";
import {
  buildPicksShare,
  buildResultsShare,
  resultClause,
  type Grade,
} from "@/lib/share";
import { SHARE_DOMAIN } from "@/lib/constants";
import type { Game } from "@/lib/week";
import type { PickMap } from "@/lib/picks";

const CORRECT = "\u{1F7E9}";
const WRONG = "\u{1F7E5}";
const PENDING = "⬜";

/** Sixteen grades, all the same, for the shape tests. */
function all(grade: Grade): Grade[] {
  return Array.from({ length: 16 }, () => grade);
}

/** Kickoffs in Eastern, given as the UTC instants the database stores. */
const SUNDAY_1PM = "2026-09-13T17:00:00Z"; // Sun 13:00 ET
const SUNDAY_425 = "2026-09-13T20:25:00Z"; // Sun 16:25 ET
const SUNDAY_NIGHT = "2026-09-14T00:20:00Z"; // Sun 20:20 ET
const MONDAY_NIGHT = "2026-09-15T00:15:00Z"; // Mon 20:15 ET

describe("buildResultsShare", () => {
  it("lays the grid out eight to a line so it cannot wrap on a phone", () => {
    const text = buildResultsShare({
      weekNumber: 18,
      totals: all(true),
      spreads: all(true),
      correct: 32,
      possible: 32,
      clause: "a perfect week",
    });

    expect(text.split("\n")).toEqual([
      "Perfect Sunday — Week 18",
      CORRECT.repeat(8),
      CORRECT.repeat(8),
      "over/under",
      CORRECT.repeat(8),
      CORRECT.repeat(8),
      "spread",
      "32/32 — a perfect week",
      SHARE_DOMAIN,
    ]);
  });

  it("shows an ungraded game as neither right nor wrong", () => {
    // A share sent mid-Sunday is the common case, not an edge one. Painting a
    // game that has not kicked off as a miss would be a lie about the entry.
    const totals: Grade[] = [true, false, null];
    const text = buildResultsShare({
      weekNumber: 3,
      totals,
      spreads: [true, true, null],
      correct: 4,
      possible: 6,
      clause: "still alive",
    });

    expect(text.split("\n")[1]).toBe(`${CORRECT}${WRONG}${PENDING}`);
  });
});

describe("resultClause", () => {
  it("names the window the entry died in", () => {
    expect(
      resultClause({
        kickoffs: [SUNDAY_1PM, SUNDAY_425, SUNDAY_NIGHT],
        totals: [true, true, true],
        spreads: [true, false, true],
      }),
    ).toBe("busted in the 4:25");
  });

  it("takes the earliest miss, not the last one", () => {
    expect(
      resultClause({
        kickoffs: [SUNDAY_1PM, SUNDAY_425, SUNDAY_NIGHT],
        totals: [false, true, false],
        spreads: [true, false, true],
      }),
    ).toBe("busted in the 1pm");
  });

  it("busts on either layer of a game", () => {
    expect(
      resultClause({
        kickoffs: [SUNDAY_1PM],
        totals: [true],
        spreads: [false],
      }),
    ).toBe("busted in the 1pm");
  });

  it("drops the preposition for windows named as a day", () => {
    expect(
      resultClause({ kickoffs: [SUNDAY_NIGHT], totals: [false], spreads: [true] }),
    ).toBe("busted Sunday night");
    expect(
      resultClause({ kickoffs: [MONDAY_NIGHT], totals: [false], spreads: [true] }),
    ).toBe("busted Monday night");
  });

  it("is still alive while games are ungraded and nothing has missed", () => {
    expect(
      resultClause({
        kickoffs: [SUNDAY_1PM, SUNDAY_425],
        totals: [true, null],
        spreads: [true, null],
      }),
    ).toBe("still alive");
  });

  it("calls a fully graded clean sheet perfect", () => {
    expect(
      resultClause({
        kickoffs: [SUNDAY_1PM, SUNDAY_425],
        totals: [true, true],
        spreads: [true, true],
      }),
    ).toBe("a perfect week");
  });

  it("prefers a miss over still-alive even when games remain", () => {
    // Busted is terminal. A later ungraded game cannot bring an entry back, and
    // saying "still alive" next to a red square would contradict the grid.
    expect(
      resultClause({
        kickoffs: [SUNDAY_1PM, SUNDAY_425],
        totals: [false, null],
        spreads: [true, null],
      }),
    ).toBe("busted in the 1pm");
  });
});

describe("kickoff windows through resultClause", () => {
  it("reads Thursday night in Eastern, not UTC", () => {
    // 2026-09-11T00:20Z is Thursday 8:20pm in New York. Deriving the weekday in
    // UTC would call this Friday and print the wrong window.
    expect(
      resultClause({
        kickoffs: ["2026-09-11T00:20:00Z"],
        totals: [false],
        spreads: [true],
      }),
    ).toBe("busted Thursday night");
  });

  it("holds through the November DST shift", () => {
    // 2026-11-22T21:25Z is 4:25pm ET on standard time. A hardcoded -4 offset
    // would place it at 5:25pm and push it out of the 4:25 window.
    expect(
      resultClause({
        kickoffs: ["2026-11-22T21:25:00Z"],
        totals: [false],
        spreads: [true],
      }),
    ).toBe("busted in the 4:25");
  });
});

const game = (over: Partial<Game>): Game => ({
  id: "g1",
  away_team: "DAL",
  home_team: "NYG",
  kickoff_at: "2026-09-13T17:00:00Z",
  spread: -3.5,
  total: 45.5,
  over_odds: -110,
  under_odds: -110,
  status: "scheduled",
  home_score: null,
  away_score: null,
  ...over,
});

describe("buildPicksShare", () => {
  const games = [
    game({ id: "g1", away_team: "DAL", home_team: "NYG", spread: 3.5, total: 45.5 }),
    game({ id: "g2", away_team: "NYJ", home_team: "BUF", spread: -9.5, total: 38.5 }),
  ];
  const picks: PickMap = {
    g1: { total: "OVER", spread: "NYG" },
    g2: { total: "UNDER", spread: "BUF" },
  };

  it("writes one self-explanatory line per game with real numbers", () => {
    const text = buildPicksShare(3, games, picks);
    expect(text).toContain("DAL @ NYG — NYG +3.5 · Over 45.5");
    expect(text).toContain("NYJ @ BUF — BUF -9.5 · Under 38.5");
  });

  it("leads with the stakes and ends with the invite and link", () => {
    const lines = buildPicksShare(3, games, picks).split("\n");
    expect(lines[0]).toBe("Perfect Sunday — Week 3");
    expect(lines[1]).toBe("My 4 picks. Every one has to hit.");
    expect(lines[2]).toBe("Perfect week wins $1,000.");
    expect(lines.at(-2)).toBe("Fade me or beat me. Free to play:");
    // The spec ships the bare domain, no protocol — chat apps linkify it and
    // it reads less like spam in a group text.
    expect(lines.at(-1)).toBe("saroldhand.github.io/perfect-sunday");
  });

  it("shows the away side's line when the away team is the spread pick", () => {
    const text = buildPicksShare(3, games, { ...picks, g1: { total: "OVER", spread: "DAL" } });
    expect(text).toContain("DAL @ NYG — DAL -3.5 · Over 45.5");
  });

  it("marks an unpicked side rather than dropping the game", () => {
    const text = buildPicksShare(3, games, { ...picks, g2: { total: null, spread: "BUF" } });
    expect(text).toContain("NYJ @ BUF — BUF -9.5 · —");
  });
});
