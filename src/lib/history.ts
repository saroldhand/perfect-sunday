/**
 * Previous weeks: the user's own picks in weeks that have already gone by.
 *
 * Same shape of decision as lib/season.ts — one query, then a pure grouping
 * function tested without a database. A week's worth of picks is at most
 * sixteen rows and a season at most 272, so pulling them together and
 * grouping in the client costs nothing and avoids both a view and a
 * per-week round trip.
 *
 * What counts as previous is the clock, not the status. `locks_at <= now`
 * is the honest test: it is true of a week that was graded, of one still
 * being graded, and of the demo week that was never locked at all — and
 * every one of those is something the user can only look back at, never
 * change. Keying off `scored` instead would hide a week mid-grading, which
 * is exactly when someone wants to look.
 *
 * This module imports no Supabase client, so it is testable without one —
 * the read lives in lib/picks.ts beside the table it queries, the same split
 * season.ts and entries.ts already use.
 */

import type { ResultMap, TotalSide } from "@/lib/picks";
import type { Game, Week } from "@/lib/week";

/** One past week, in the same shape the current week reaches My Week in, so
 *  the row and strip components are reusable as they stand. */
export type HistoryWeek = {
  week: Week;
  games: Game[];
  results: ResultMap;
};

/** Shape PostgREST returns: many-to-one embeds are objects, not arrays. */
export type RawHistoryPick = {
  game_id: string;
  total_pick: string | null;
  spread_pick: string | null;
  total_correct: boolean | null;
  spread_correct: boolean | null;
  games: (Game & { weeks: Week | null }) | null;
};

/**
 * The embedded week rides along on every game the query returns. Copying the
 * fields out by name rather than spreading and deleting keeps the result
 * exactly a `Game` — so the row and strip components receive the same shape
 * getGames hands them, with nothing extra they could come to depend on.
 */
function bareGame(game: Game & { weeks: Week | null }): Game {
  return {
    id: game.id,
    home_team: game.home_team,
    away_team: game.away_team,
    kickoff_at: game.kickoff_at,
    spread: game.spread,
    total: game.total,
    over_odds: game.over_odds,
    under_odds: game.under_odds,
    home_score: game.home_score,
    away_score: game.away_score,
    status: game.status,
  };
}

/**
 * Groups raw pick rows into past weeks, newest first.
 *
 * `excludeWeekId` is the week My Week is already showing. Once a week locks it
 * is simultaneously the current week and a week in the past, and listing it in
 * both places would have the user comparing a screen against itself — so the
 * screen that can still act on it wins, and Previous picks up where it leaves
 * off.
 *
 * A row whose game or week embed is missing is dropped rather than guessed at.
 * The inner joins mean it should not happen; if it somehow does, a pick with
 * no week cannot be attributed to one.
 */
export function toHistoryWeeks(
  rows: RawHistoryPick[],
  now: number,
  excludeWeekId?: number,
): HistoryWeek[] {
  const byWeek = new Map<number, HistoryWeek>();

  for (const row of rows) {
    const game = row.games;
    const week = game?.weeks;
    if (!game || !week) continue;
    if (week.id === excludeWeekId) continue;
    if (Date.parse(week.locks_at) > now) continue;

    let bucket = byWeek.get(week.id);
    if (!bucket) {
      bucket = { week, games: [], results: {} };
      byWeek.set(week.id, bucket);
    }

    bucket.games.push(bareGame(game));
    bucket.results[game.id] = {
      total: (row.total_pick as TotalSide | null) ?? null,
      spread: row.spread_pick,
      totalCorrect: row.total_correct,
      spreadCorrect: row.spread_correct,
    };
  }

  const weeks = [...byWeek.values()];

  // Kickoff order within a week, matching getGames, the deck, the glance strip
  // and the share grid — the whole point of that order is that two people can
  // line their lists up row by row, and a history screen is where they do it.
  for (const entry of weeks) {
    entry.games.sort(
      (a, b) =>
        Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at) ||
        a.id.localeCompare(b.id),
    );
  }

  // Newest first: the week someone wants is nearly always the one just gone.
  // Ordered by locks_at rather than week number, because a week number does
  // not tell you when it happened and this list can span seasons.
  return weeks.sort(
    (a, b) => Date.parse(b.week.locks_at) - Date.parse(a.week.locks_at),
  );
}

/**
 * Whether the list needs to name each week's season.
 *
 * With one season in view "Week 18" is unambiguous and the year is noise. The
 * moment two are — which is true right now, with a 2025 demo week sitting
 * behind the 2026 season — an unlabelled "Week 18" beside "Week 2" invites the
 * reader to supply the wrong year themselves, the same failure the team stat
 * line's provenance label exists to prevent.
 */
export function spansSeasons(weeks: HistoryWeek[]): boolean {
  return new Set(weeks.map((entry) => entry.week.season)).size > 1;
}
