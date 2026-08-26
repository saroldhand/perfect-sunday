import type { ResultMap } from "@/lib/picks";
import type { Game } from "@/lib/week";

/**
 * What one pip in the week strip is saying. `picked` is deliberately distinct
 * from an outcome: between locking and grading you are on the board without
 * being right or wrong yet, and that is most of the week.
 */
export type PipState = "empty" | "picked" | "correct" | "wrong";

export type Glance = {
  totals: PipState[];
  spreads: PipState[];
  /** Individual picks made, out of two per game. */
  picked: number;
  possible: number;
  /** Correct picks, and how many have been graded so far to count against. */
  correct: number;
  graded: number;
};

/**
 * A grade is only ever shown for a side that was actually picked. The database
 * cannot produce a grade without a pick, but a pip claiming an outcome the user
 * never chose is the worst thing this strip could say, so the pick is checked
 * first regardless.
 */
function pip(choice: string | null, correct: boolean | null): PipState {
  if (!choice) return "empty";
  if (correct === null) return "picked";
  return correct ? "correct" : "wrong";
}

/**
 * The week reduced to two rows of pips, one column per game.
 *
 * Built from `games` in the order they arrive — kickoff order — because the
 * strip is only worth having if its columns line up with the rows beneath it
 * and with the grid the share builds.
 */
export function buildGlance(games: Game[], results: ResultMap): Glance {
  const totals: PipState[] = [];
  const spreads: PipState[] = [];

  for (const game of games) {
    const result = results[game.id];
    totals.push(pip(result?.total ?? null, result?.totalCorrect ?? null));
    spreads.push(pip(result?.spread ?? null, result?.spreadCorrect ?? null));
  }

  const cells = [...totals, ...spreads];

  return {
    totals,
    spreads,
    picked: cells.filter((state) => state !== "empty").length,
    possible: games.length * 2,
    correct: cells.filter((state) => state === "correct").length,
    graded: cells.filter((state) => state === "correct" || state === "wrong").length,
  };
}

const PIP_WORDS: Record<PipState, string> = {
  correct: "correct",
  wrong: "wrong",
  picked: "not graded",
  empty: "not picked",
};

/**
 * What a row of pips says out loud. The strip carries real information rather
 * than decoration, so it has to survive being read rather than seen.
 */
export function describePips(label: string, pips: PipState[]): string {
  const order: PipState[] = ["correct", "wrong", "picked", "empty"];

  const parts = order
    .map((state) => ({ state, count: pips.filter((p) => p === state).length }))
    .filter(({ count }) => count > 0)
    .map(({ state, count }) => `${count} ${PIP_WORDS[state]}`);

  if (parts.length === 0 || pips.every((p) => p === "empty")) {
    return `${label}: none picked yet`;
  }

  return `${label}: ${parts.join(", ")}`;
}
