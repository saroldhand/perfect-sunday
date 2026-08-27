/**
 * The one place scores enter this product — the results twin of
 * oddsProvider.ts, swappable the same way: one more ScoresProvider and one
 * changed constant in sync-scores, nothing else moves.
 *
 * The provider is ESPN's public scoreboard feed, chosen over nflverse for one
 * reason: it updates live. nflverse's games.csv (the lines source) carries
 * final scores too, but on a publishing lag measured in hours — and the whole
 * point of sync-scores is a pick flipping green while the user watches. The
 * feed is unofficial-but-ubiquitous rather than documented; every assumption
 * about its shape is pinned in src/lib/scoresProvider.test.ts, and the parser
 * fails toward skipping — a game it cannot read stays untouched in the
 * database, visible as a fetched-vs-updated gap in the function's report,
 * never a wrong number written quietly.
 */

import { externalId } from "./oddsProvider.ts";

/** One game's result state, in this product's conventions. */
export type ScoreRow = {
  /** Matches `games.external_id`, e.g. "2026-01-NE-SEA". */
  externalId: string;
  homeScore: number;
  awayScore: number;
  /**
   * Only the two states apply_week_scores accepts. A game the feed shows as
   * not yet started, postponed, or canceled produces no row at all — leaving
   * the database untouched is the correct write for every one of those.
   */
  status: "in_progress" | "final";
};

export type ScoresProvider = {
  /** Named in the function's report, so an outage names its culprit. */
  readonly source: string;
  fetchScores(season: number, week: number): Promise<ScoreRow[]>;
};

/**
 * ESPN abbreviates Washington WSH; `teams.abbr` (and nflverse, and therefore
 * every external_id) uses WAS. Every other current club matches. An unmapped
 * abbreviation builds an external_id that matches no games row — zero rows
 * updated and a visible gap in the report, not a mislabelled team.
 */
const ABBR: Record<string, string> = { WSH: "WAS" };

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export const espnProvider: ScoresProvider = {
  source: "espn-scoreboard",

  async fetchScores(season, week) {
    // dates=<year> + seasontype=2 (regular season) + week pins the response to
    // exactly the slate the caller is grading, rather than "today".
    const url = `${SCOREBOARD_URL}?dates=${season}&seasontype=2&week=${week}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`espn fetch failed: ${response.status} ${response.statusText}`);
    }
    return parseEspnScoreboard(await response.json(), season, week);
  },
};

/**
 * The half that can be wrong in a way nobody notices, kept pure for the tests.
 *
 * The status mapping is the load-bearing part. ESPN's state machine is
 * pre → in → post, with `completed` distinguishing a finished game from a
 * postponed or abandoned one (both also land in "post"):
 *
 *   pre                      -> no row; nothing has happened
 *   in                       -> in_progress, live score
 *   post with completed true -> final; this is what triggers grading
 *   post, completed false    -> no row; postponed/abandoned is the operator's
 *                               judgement call, never a feed's
 *
 * Everything is read defensively because the shape is observed, not promised:
 * a malformed event is skipped, not thrown on, so one odd row cannot take
 * down the sweep for the fifteen good ones.
 */
export function parseEspnScoreboard(
  payload: unknown,
  season: number,
  week: number,
): ScoreRow[] {
  const events = (payload as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];

  const rows: ScoreRow[] = [];

  for (const event of events) {
    // Belt against the query parameters being ignored: an event that names a
    // different week or season than the one asked for is not written.
    const eventWeek = get(event, "week", "number");
    if (typeof eventWeek === "number" && eventWeek !== week) continue;
    const eventSeason = get(event, "season", "year");
    if (typeof eventSeason === "number" && eventSeason !== season) continue;

    const competition = Array.isArray(get(event, "competitions"))
      ? (get(event, "competitions") as unknown[])[0]
      : null;
    if (!competition) continue;

    const state = get(competition, "status", "type", "state") ?? get(event, "status", "type", "state");
    const completed =
      get(competition, "status", "type", "completed") ?? get(event, "status", "type", "completed");

    let status: ScoreRow["status"];
    if (state === "in") status = "in_progress";
    else if (state === "post" && completed === true) status = "final";
    else continue;

    const competitors = get(competition, "competitors");
    if (!Array.isArray(competitors)) continue;
    const home = side(competitors, "home");
    const away = side(competitors, "away");
    if (!home || !away) continue;

    rows.push({
      externalId: externalId(season, week, away.abbr, home.abbr),
      homeScore: home.score,
      awayScore: away.score,
      status,
    });
  }

  return rows;
}

/** One competitor's abbreviation (mapped to ours) and numeric score, or null
 *  when either cannot be read. ESPN serialises scores as strings. */
function side(
  competitors: unknown[],
  homeAway: "home" | "away",
): { abbr: string; score: number } | null {
  const competitor = competitors.find((c) => get(c, "homeAway") === homeAway);
  if (!competitor) return null;

  const raw = get(competitor, "team", "abbreviation");
  if (typeof raw !== "string" || raw === "") return null;
  const abbr = ABBR[raw] ?? raw;

  // Number("") is 0, not NaN — a blank score must read as unreadable, never
  // as a shutout in progress.
  const rawScore = get(competitor, "score");
  const score =
    typeof rawScore === "number"
      ? rawScore
      : typeof rawScore === "string" && rawScore.trim() !== ""
        ? Number(rawScore)
        : NaN;
  if (!Number.isFinite(score)) return null;

  return { abbr, score };
}

/** Walks a path of keys through untyped JSON, undefined the moment it cannot. */
function get(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
