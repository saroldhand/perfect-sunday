import type { Week } from "@/lib/week";
import type { EntryRow } from "@/lib/leaderboard";

export type Verdict = "perfect" | "alive" | "busted" | "no-entry";

/**
 * "no-entry" is not a failure state to hide. lock_week creates an entry only
 * for a complete set, so someone who picked twelve of sixteen has no entry,
 * is not scored, and does not appear on the board. Saying so plainly is the
 * whole point of blocking partial entries.
 */
export function verdictOf(entry: EntryRow | null): Verdict {
  if (!entry) return "no-entry";
  if (entry.is_perfect) return "perfect";
  if (entry.is_alive) return "alive";
  return "busted";
}

export type HubInput = {
  week: Week | null;
  totalGames: number;
  completed: number;
  entry: EntryRow | null;
};

export type HubView =
  | { kind: "no-week" }
  | { kind: "upcoming"; week: Week }
  | { kind: "open"; week: Week; completed: number; totalGames: number; allIn: boolean }
  | { kind: "locked"; week: Week; totalGames: number }
  | { kind: "scored"; week: Week; correct: number; possible: number; verdict: Verdict };

/**
 * Which of five states the hub is in. Each gets its own layout rather than one
 * layout with fields blanked out, because "4 of 16 picked" and "21 of 32
 * correct" are not the same sentence with different numbers in it.
 */
export function hubView(input: HubInput): HubView {
  const { week, totalGames, completed, entry } = input;

  if (!week) return { kind: "no-week" };

  // A week with no slate is upcoming whatever its status column says. Picks
  // open only once every game has a posted line.
  if (week.status === "upcoming" || totalGames === 0) {
    return { kind: "upcoming", week };
  }

  if (week.status === "open") {
    return {
      kind: "open",
      week,
      completed,
      totalGames,
      allIn: completed === totalGames,
    };
  }

  if (week.status === "locked") {
    return { kind: "locked", week, totalGames };
  }

  return {
    kind: "scored",
    week,
    correct: entry?.correct_count ?? 0,
    possible: entry?.picks_possible ?? totalGames * 2,
    verdict: verdictOf(entry),
  };
}
