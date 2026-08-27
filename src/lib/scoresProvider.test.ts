import { describe, expect, it } from "vitest";
import { parseEspnScoreboard } from "../../supabase/functions/_shared/scoresProvider.ts";

/**
 * The scoreboard shape is observed rather than documented, so these fixtures
 * are the contract: every field the parser reads, and the exact status
 * mapping. If ESPN moves something, the first symptom in production is a
 * fetched-vs-updated gap in sync-scores' report; the fix lands here first.
 *
 * Scores are strings in the real feed — one fixture keeps them that way on
 * purpose so a parser that forgets to convert fails loudly.
 */
function event(overrides: {
  home: string;
  away: string;
  homeScore?: string | number;
  awayScore?: string | number;
  state?: string;
  completed?: boolean;
  week?: number;
  year?: number;
}) {
  const {
    home,
    away,
    homeScore = "0",
    awayScore = "0",
    state = "post",
    completed = state === "post",
    week = 1,
    year = 2026,
  } = overrides;
  return {
    week: { number: week },
    season: { year, type: 2 },
    competitions: [
      {
        competitors: [
          { homeAway: "home", team: { abbreviation: home }, score: homeScore },
          { homeAway: "away", team: { abbreviation: away }, score: awayScore },
        ],
        status: { type: { state, completed } },
      },
    ],
  };
}

function scoreboard(...events: unknown[]) {
  return { events };
}

describe("parseEspnScoreboard", () => {
  it("maps a completed game to a final, scores on the right sides", () => {
    // Orientation is the assertion that matters: external_id is away-home,
    // scores are home/away columns, and swapping either grades every pick of
    // the game against the wrong number while looking entirely normal.
    const rows = parseEspnScoreboard(
      scoreboard(event({ home: "SEA", away: "NE", homeScore: "24", awayScore: "17" })),
      2026,
      1,
    );
    expect(rows).toEqual([
      { externalId: "2026-01-NE-SEA", homeScore: 24, awayScore: 17, status: "final" },
    ]);
  });

  it("maps an in-progress game with its live score", () => {
    const rows = parseEspnScoreboard(
      scoreboard(
        event({ home: "GB", away: "CHI", homeScore: "10", awayScore: "7", state: "in", completed: false }),
      ),
      2026,
      1,
    );
    expect(rows).toEqual([
      { externalId: "2026-01-CHI-GB", homeScore: 10, awayScore: 7, status: "in_progress" },
    ]);
  });

  it("remaps ESPN's WSH to this product's WAS", () => {
    const [row] = parseEspnScoreboard(
      scoreboard(event({ home: "WSH", away: "DAL", homeScore: "20", awayScore: "13" })),
      2026,
      1,
    );
    expect(row.externalId).toBe("2026-01-DAL-WAS");
  });

  it("produces no row for a game that has not started", () => {
    expect(
      parseEspnScoreboard(
        scoreboard(event({ home: "KC", away: "LV", state: "pre", completed: false })),
        2026,
        1,
      ),
    ).toEqual([]);
  });

  it("produces no row for a postponed or abandoned game: post without completed", () => {
    // Both land in ESPN's "post" state with completed false. Writing them as
    // finals would grade a game that was never played; writing them at all is
    // the operator's judgement call, so the feed stays silent.
    expect(
      parseEspnScoreboard(
        scoreboard(event({ home: "BUF", away: "MIA", state: "post", completed: false })),
        2026,
        1,
      ),
    ).toEqual([]);
  });

  it("drops an event naming a different week or season than asked for", () => {
    // Belt against the query parameters being ignored: a feed that answers
    // with the wrong slate must not write into the one being graded.
    const rows = parseEspnScoreboard(
      scoreboard(
        event({ home: "SEA", away: "NE", week: 2 }),
        event({ home: "GB", away: "CHI", year: 2025 }),
        event({ home: "DET", away: "NO", homeScore: "31", awayScore: "3" }),
      ),
      2026,
      1,
    );
    expect(rows.map((r) => r.externalId)).toEqual(["2026-01-NO-DET"]);
  });

  it("skips a malformed event without losing the rest of the slate", () => {
    const unreadable = {
      week: { number: 1 },
      competitions: [{ competitors: [{ homeAway: "home", team: {}, score: "3" }] }],
    };
    const rows = parseEspnScoreboard(
      scoreboard(unreadable, event({ home: "PIT", away: "ATL", homeScore: "27", awayScore: "24" })),
      2026,
      1,
    );
    expect(rows.map((r) => r.externalId)).toEqual(["2026-01-ATL-PIT"]);
  });

  it("skips a game whose score is not a number rather than writing one", () => {
    expect(
      parseEspnScoreboard(
        scoreboard(event({ home: "TEN", away: "NYJ", homeScore: "", awayScore: "7", state: "in" })),
        2026,
        1,
      ),
    ).toEqual([]);
  });

  it("returns nothing for an empty or shapeless payload", () => {
    expect(parseEspnScoreboard(scoreboard(), 2026, 1)).toEqual([]);
    expect(parseEspnScoreboard({}, 2026, 1)).toEqual([]);
    expect(parseEspnScoreboard(null, 2026, 1)).toEqual([]);
  });
});
