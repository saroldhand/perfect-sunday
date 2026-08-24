"use client";

import { lineFor, formatKickoff, formatTotal } from "@/lib/format";
import type { Pick } from "@/lib/picks";
import type { Game } from "@/lib/week";

export type Grade = { total: boolean | null; spread: boolean | null };
export type Score = { home: number | null; away: number | null };

type Props = {
  index: number;
  game: Game;
  pick: Pick | undefined;
  /** Omitted before scoring. A null field means that side is not graded yet. */
  grade?: Grade;
  score?: Score;
  /** Supplied by the review screen, where a row jumps back to its card. */
  onJump?: () => void;
};

/**
 * One game's line in a list of picks. Shared by the review screen and My Week
 * so the two cannot drift apart the next time a line format changes.
 */
export function PickSummaryRow({ index, game, pick, grade, score, onJump }: Props) {
  const complete = Boolean(pick?.total && pick?.spread);

  const body = (
    <>
      <span className="tabular w-6 shrink-0 text-xs text-[var(--color-text-muted)]">
        {index + 1}
      </span>
      <span className="font-[family-name:var(--font-display)] w-28 shrink-0 text-base font-semibold uppercase">
        {game.away_team} @ {game.home_team}
      </span>
      <span className="min-w-0 flex-1 text-xs text-[var(--color-text-muted)]">
        {complete ? (
          <>
            <Mark correct={grade?.total} />
            <span className="text-[var(--color-text)]">
              {pick!.total === "OVER" ? "Over" : "Under"}
            </span>{" "}
            <span className="tabular">{formatTotal(game.total)}</span> ·{" "}
            <Mark correct={grade?.spread} />
            <span className="text-[var(--color-text)]">{pick!.spread}</span>{" "}
            <span className="tabular">
              {lineFor(game.spread, pick!.spread === game.home_team ? "home" : "away")}
            </span>
            {score && score.home !== null && score.away !== null && (
              <span className="tabular block text-[var(--color-text-muted)]">
                Final {score.away}–{score.home}
              </span>
            )}
          </>
        ) : (
          <span>Not picked · {formatKickoff(game.kickoff_at)}</span>
        )}
      </span>
    </>
  );

  if (onJump) {
    return (
      <li>
        <button
          type="button"
          onClick={onJump}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          {body}
        </button>
      </li>
    );
  }

  return <li className="flex items-center gap-3 px-4 py-3">{body}</li>;
}

/**
 * A push — a combined score landing exactly on the total, or a spread landing
 * exactly on the number — is recorded as correct for both sides. It shows a
 * check, not a third state: inventing one here would contradict both the
 * database and the rules page.
 */
function Mark({ correct }: { correct?: boolean | null }) {
  if (correct === undefined || correct === null) return null;
  return (
    <span
      aria-label={correct ? "correct" : "wrong"}
      className={`mr-1 ${correct ? "text-[var(--color-correct)]" : "text-[var(--color-wrong)]"}`}
    >
      {correct ? "✓" : "✗"}
    </span>
  );
}
