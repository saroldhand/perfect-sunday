"use client";

import { useState } from "react";
import { lineFor, formatKickoff } from "@/lib/format";
import { isGameComplete, type PickMap } from "@/lib/picks";
import { buildPicksShare, shareText } from "@/lib/share";
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
  const [toast, setToast] = useState<string | null>(null);

  const missing = games.filter((g) => !isGameComplete(picks[g.id]));
  const allIn = missing.length === 0;

  async function share() {
    const text = buildPicksShare(
      weekNumber,
      games.map((g) => picks[g.id]?.moneyline ?? "—"),
      games.map((g) => picks[g.id]?.spread ?? "—"),
    );
    const outcome = await shareText(text);
    if (outcome === "shared") return; // the native sheet is its own feedback
    setToast(outcome === "copied" ? "Copied" : "Could not share");
    setTimeout(() => setToast(null), 2000);
  }

  if (locked) {
    return (
      <div className="py-6">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
          Picks are in
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          All {games.length * 2} of them. Nothing to do now but wait.
        </p>
        <button
          type="button"
          onClick={share}
          className="mt-6 min-h-14 w-full rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          Share your picks
        </button>
        {toast && (
          <p className="mt-3 text-center text-sm text-[var(--color-text-muted)]">
            {toast}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="py-6">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold uppercase tracking-tight">
        Review
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {allIn
          ? "Every game is picked. Tap any row to change one."
          : `${missing.length} game${missing.length === 1 ? "" : "s"} still to pick.`}
      </p>

      <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {games.map((game, index) => {
          const pick = picks[game.id];
          const complete = isGameComplete(pick);
          return (
            <li key={game.id}>
              <button
                type="button"
                onClick={() => onJump(index)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="tabular w-6 shrink-0 text-xs text-[var(--color-text-muted)]">
                  {index + 1}
                </span>
                <span className="font-[family-name:var(--font-display)] w-28 shrink-0 text-base font-semibold uppercase">
                  {game.away_team} @ {game.home_team}
                </span>
                <span className="min-w-0 flex-1 text-xs text-[var(--color-text-muted)]">
                  {complete ? (
                    <>
                      <span className="text-[var(--color-text)]">
                        {pick!.moneyline}
                      </span>{" "}
                      to win ·{" "}
                      <span className="text-[var(--color-text)]">
                        {pick!.spread}
                      </span>{" "}
                      <span className="tabular">
                        {lineFor(
                          game.spread,
                          pick!.spread === game.home_team ? "home" : "away",
                        )}
                      </span>
                    </>
                  ) : (
                    <span>Not picked · {formatKickoff(game.kickoff_at)}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={!allIn || locking}
        onClick={onLock}
        className="mt-6 min-h-14 w-full rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10] disabled:opacity-40"
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
