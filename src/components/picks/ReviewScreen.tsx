"use client";

import { PickSummaryRow } from "@/components/week/PickSummaryRow";
import { ShareButton } from "@/components/app/ShareButton";
import { isGameComplete, type PickMap } from "@/lib/picks";
import { buildPicksShare } from "@/lib/share";
import type { Game } from "@/lib/week";

type Props = {
  weekNumber: number;
  games: Game[];
  picks: PickMap;
  onJump: (index: number) => void;
  onLock: () => void;
  locking: boolean;
  locked: boolean;
};

export function ReviewScreen({
  weekNumber,
  games,
  picks,
  onJump,
  onLock,
  locking,
  locked,
}: Props) {
  const missing = games.filter((g) => !isGameComplete(picks[g.id]));
  const allIn = missing.length === 0;

  const shareTextFor = () => buildPicksShare(weekNumber, games, picks);

  if (locked) {
    return (
      <div className="py-6">
        <h2 className="wordmark text-5xl">
          Picks <span className="text-gold">are in</span>
        </h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          All {games.length * 2} of them. Nothing to do now but wait.
        </p>
        <ShareButton build={shareTextFor} label="Share your picks" />
      </div>
    );
  }

  return (
    <div className="py-6">
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold uppercase tracking-tight">
        Review
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {allIn
          ? "Every game is picked. Tap any row to change one."
          : `${missing.length} game${missing.length === 1 ? "" : "s"} still to pick.`}
      </p>

      <ul className="card mt-5 divide-y divide-[var(--color-border)]">
        {games.map((game, index) => (
          <PickSummaryRow
            key={game.id}
            index={index}
            game={game}
            pick={picks[game.id]}
            onJump={() => onJump(index)}
          />
        ))}
      </ul>

      <button
        type="button"
        disabled={!allIn || locking}
        onClick={onLock}
        className="btn btn-gold mt-6"
      >
        {locking ? "Locking in…" : "Lock in picks"}
      </button>

      {!allIn && (
        <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
          A partial entry is not scored. All {games.length * 2} picks or nothing.
        </p>
      )}
    </div>
  );
}
