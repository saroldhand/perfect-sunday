import { SHARE_DOMAIN } from "@/lib/constants";
import { formatTotal, kickoffWindow, lineFor } from "@/lib/format";
import type { PickMap } from "@/lib/picks";
import type { Game } from "@/lib/week";

/**
 * Pre-lock picks share. One self-explanatory line per game, real numbers
 * included — "DAL @ NYG — NYG +3.5 · Over 45.5" — because a first-time
 * recipient in a group chat has to get the stakes without ever having seen
 * the product. The cryptic Wordle-grid form the spec sketched assumed the
 * recipient already knew the game; a line they can argue with ("BUF -9.5??")
 * is what makes them reply, and the reply is the growth loop.
 *
 * Games stay in kickoff order so two people comparing slates are reading the
 * same games in the same positions.
 *
 * Plain text on purpose. No image generation, no hosting, no load time; it
 * pastes into iMessage, WhatsApp and Slack identically.
 */
export function buildPicksShare(
  weekNumber: number,
  games: Game[],
  picks: PickMap,
): string {
  return [
    `Perfect Sunday — Week ${weekNumber}`,
    `My ${games.length * 2} picks. Every one has to hit.`,
    "Perfect week wins $1,000.",
    "",
    ...games.map((game) => gameLine(game, picks[game.id])),
    "",
    "Fade me or beat me. Free to play:",
    SHARE_DOMAIN,
  ].join("\n");
}

function gameLine(game: Game, pick: PickMap[string] | undefined): string {
  const spread =
    pick?.spread != null
      ? `${pick.spread} ${lineFor(game.spread, pick.spread === game.home_team ? "home" : "away")}`
      : "—";
  const total =
    pick?.total != null
      ? `${pick.total === "OVER" ? "Over" : "Under"} ${formatTotal(game.total)}`
      : "—";
  return `${game.away_team} @ ${game.home_team} — ${spread} · ${total}`;
}

/**
 * Eight squares to a line, so the grid never wraps in a narrow message
 * bubble. Joined without a separator: the grid reads as a block, and spaces
 * would make eight squares wider than the line they are sized for.
 */
function chunk(items: string[], size: number, separator = " "): string[] {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += size) {
    lines.push(items.slice(i, i + size).join(separator));
  }
  return lines;
}

/**
 * How one pick came out. `null` is a game that has not been graded yet, which
 * the grid must show as neither right nor wrong — a mid-Sunday share is the
 * common case, not an edge one.
 */
export type Grade = boolean | null;

const SQUARE = { correct: "\u{1F7E9}", wrong: "\u{1F7E5}", pending: "\u2B1C" };

function square(grade: Grade): string {
  if (grade === true) return SQUARE.correct;
  if (grade === false) return SQUARE.wrong;
  return SQUARE.pending;
}

/**
 * The results grid — the share the whole product is pointed at.
 *
 * Unlike the picks share, this one stays a grid: green and red squares carry
 * their own drama and need no explanation. Eight per line so it never wraps
 * on a narrow phone, over/under block first, spread second, games in kickoff
 * order. That ordering is the feature. Two people comparing grids are looking
 * at the same game in the same position, which is what makes "which one did
 * you miss?" work at all.
 *
 * The tally line carries the story rather than just the number. "29/32" is a
 * score; "29/32 — busted in the 4:25" is the thing someone sends to a group
 * chat. Callers build that clause with `bustedClause`.
 */
export function buildResultsShare(input: {
  weekNumber: number;
  totals: Grade[];
  spreads: Grade[];
  correct: number;
  possible: number;
  clause: string;
}): string {
  const { weekNumber, totals, spreads, correct, possible, clause } = input;
  return [
    `Perfect Sunday — Week ${weekNumber}`,
    ...chunk(totals.map(square), 8, ""),
    "over/under",
    ...chunk(spreads.map(square), 8, ""),
    "spread",
    `${correct}/${possible} — ${clause}`,
    SHARE_DOMAIN,
  ].join("\n");
}

/**
 * The clause after the tally: "busted in the 4:25", "still alive", "a perfect
 * week".
 *
 * The first miss is found by position, not by time, which is the same thing
 * only because every array here is in kickoff order — the ordering the deck,
 * My Week and both grids all share. A miss on either layer of a game busts it.
 */
export function resultClause(input: {
  kickoffs: string[];
  totals: Grade[];
  spreads: Grade[];
}): string {
  const { kickoffs, totals, spreads } = input;

  const firstMiss = kickoffs.findIndex(
    (_, i) => totals[i] === false || spreads[i] === false,
  );
  if (firstMiss !== -1) {
    const when = kickoffWindow(kickoffs[firstMiss]);
    // "busted in the 4:25" but "busted Sunday night" — the windows named as a
    // slot take the preposition, the ones named as a day do not.
    return when.startsWith("the ") ? `busted in ${when}` : `busted ${when}`;
  }

  const pending = totals.some((g) => g === null) || spreads.some((g) => g === null);
  return pending ? "still alive" : "a perfect week";
}

export type ShareOutcome = "shared" | "copied" | "failed";

/**
 * Uses the native share sheet where there is one — on iOS that opens straight
 * into Messages, which is where this product spreads — and falls back to the
 * clipboard on desktop.
 */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      // Dismissing the sheet throws AbortError. That is a decision, not a
      // failure, so do not fall through to copying behind the user's back.
      if (err instanceof Error && err.name === "AbortError") return "failed";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
