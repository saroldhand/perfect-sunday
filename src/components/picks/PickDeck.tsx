"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameCard } from "./GameCard";
import { ProgressBar } from "./ProgressBar";
import { ReviewScreen } from "./ReviewScreen";
import { countdownTo, formatLockTime } from "@/lib/format";
import {
  countCompleted,
  isGameComplete,
  savePick,
  type Pick,
  type PickMap,
  type TotalSide,
} from "@/lib/picks";
import type { Game, Team, Week } from "@/lib/week";

// Long enough to see the selection register, short enough to feel fast.
const ADVANCE_MS = 250;
const SWIPE_THRESHOLD_PX = 50;

type Props = {
  userId: string;
  week: Week;
  games: Game[];
  teams: Record<string, Team>;
  initialPicks: PickMap;
};

export function PickDeck({ userId, week, games, teams, initialPicks }: Props) {
  const [picks, setPicks] = useState<PickMap>(initialPicks);
  // games.length means the review screen, which sits one past the last card.
  const [index, setIndex] = useState(() => firstUnpicked(games, initialPicks));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [locked, setLocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const countdown = countdownTo(week.locks_at, now);
  const weekOpen = week.status === "open" && !countdown.expired;
  const completed = countCompleted(picks, games.map((g) => g.id));

  const goTo = useCallback(
    (next: number) => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      setIndex(Math.max(0, Math.min(games.length, next)));
    },
    [games.length],
  );

  function handlePick(game: Game, kind: "total" | "spread", value: string) {
    const before = picks[game.id];
    const wasComplete = isGameComplete(before);
    const next: Pick = {
      total: kind === "total" ? (value as TotalSide) : (before?.total ?? null),
      spread: kind === "spread" ? value : (before?.spread ?? null),
    };

    // Optimistic: the tap must feel instant, and a failed write is recoverable
    // because the pick is still on screen to retry.
    setPicks((current) => ({ ...current, [game.id]: next }));
    setSaveError(null);

    savePick(
      userId,
      game.id,
      kind === "total" ? { total_pick: value as TotalSide } : { spread_pick: value },
    ).catch((err: unknown) => {
      setSaveError(err instanceof Error ? err.message : String(err));
    });

    // Advance only on the transition into complete. Changing a pick on an
    // already-finished card should leave the user where they are.
    if (!wasComplete && isGameComplete(next)) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        setIndex((current) => Math.min(games.length, current + 1));
      }, ADVANCE_MS);
    }
  }

  // Swipe navigates; taps decide. Swiping to choose a side is the Tinder
  // pattern and it is wrong here — two independent decisions per game, and an
  // accidental pick in a must-be-perfect contest is infuriating.
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    goTo(index + (dx < 0 ? 1 : -1));
  }

  const onReview = index >= games.length;
  const game = onReview ? null : games[index];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
      <header className="pt-4">
        <ProgressBar
          total={games.length}
          currentIndex={index}
          isComplete={(i) => isGameComplete(picks[games[i].id])}
          onJump={goTo}
        />
        <div className="mt-2 flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            {index > 0 && (
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                className="text-sm text-[var(--color-text-muted)]"
                aria-label="Previous game"
              >
                ← Back
              </button>
            )}
            <span className="tabular text-sm text-[var(--color-text-muted)]">
              {onReview ? "Review" : `Game ${index + 1} of ${games.length}`}
            </span>
          </div>
          <span
            className={`tabular text-xs ${
              countdown.expired
                ? "text-[var(--color-text-muted)]"
                : "text-[var(--color-accent)]"
            }`}
          >
            {countdown.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Locks {formatLockTime(week.locks_at)}
        </p>
      </header>

      <div
        className="flex-1 py-4"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {game ? (
          <GameCard
            game={game}
            teams={teams}
            pick={picks[game.id]}
            onPickTotal={(side) => handlePick(game, "total", side)}
            onPickSpread={(team) => handlePick(game, "spread", team)}
            disabled={!weekOpen || new Date(game.kickoff_at).getTime() <= now}
          />
        ) : (
          <ReviewScreen
            weekNumber={week.week_number}
            games={games}
            picks={picks}
            onJump={goTo}
            onLock={() => {
              setLocking(true);
              // Nothing to write: picks are already saved, and the week's real
              // lock is the scheduled job's job, not the client's. This is the
              // confirmation step the spec asks for, not a state change.
              setTimeout(() => {
                setLocking(false);
                setLocked(true);
              }, 300);
            }}
            locking={locking}
            locked={locked}
          />
        )}

        {saveError && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Could not save that pick:{" "}
            <span className="text-[var(--color-text)]">{saveError}</span>
          </p>
        )}
      </div>

      {!onReview && (
        <footer
          className="sticky bottom-0 bg-[var(--color-bg)] pt-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => goTo(games.length)}
            className="min-h-12 w-full rounded-[var(--radius-target)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)]"
          >
            <span className="tabular">{completed}</span> of {games.length} games
            picked · Review
          </button>
        </footer>
      )}
    </div>
  );
}

// Resume where the user left off rather than restarting at game 1.
function firstUnpicked(games: Game[], picks: PickMap): number {
  const i = games.findIndex((g) => !isGameComplete(picks[g.id]));
  return i === -1 ? games.length : i;
}
