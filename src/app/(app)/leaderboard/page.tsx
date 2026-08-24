"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWeek } from "@/components/app/WeekProvider";
import { rankEntries } from "@/lib/leaderboard";
import { countdownTo, formatLockTime } from "@/lib/format";

export default function Leaderboard() {
  const { phase, error, signedIn, userId, week, boardWeek, boardEntries } = useWeek();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (phase === "loading") return <Skeleton />;
  if (phase === "error") {
    return (
      <>
        <Title>Something went wrong</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{error}</p>
      </>
    );
  }

  const ranked = rankEntries(boardEntries);
  // Read the status out in one step rather than aliasing a boolean guard —
  // relying on TypeScript to carry `week !== null` across two statements is
  // fragile, and this says the same thing without the inference.
  const currentStatus =
    boardWeek !== null && week !== null && boardWeek.id === week.id ? week.status : null;
  const showsCurrent = currentStatus !== null;
  // The chip means nothing before lock: everyone is trivially alive.
  const showChips = currentStatus === "locked" || currentStatus === "scored";

  return (
    <>
      <Title>{boardWeek ? `Week ${boardWeek.week_number}` : "Leaderboard"}</Title>

      {!showsCurrent && week && (week.status === "open" || week.status === "upcoming") && (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Standings open when picks lock —{" "}
          <span className="tabular text-[var(--color-accent)]">
            {countdownTo(week.locks_at, now).label}
          </span>
          . Entries are created at lock, and only for a complete set.
        </p>
      )}

      {!showsCurrent && boardWeek && (
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Last week&rsquo;s final standings
        </p>
      )}

      {ranked.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          {week
            ? `Nobody is on the board yet. Locks ${formatLockTime(week.locks_at)}.`
            : "No week has been played yet."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {ranked.map((row) => {
            const mine = row.user_id === userId;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  mine ? "bg-[var(--color-surface-raised)]" : ""
                }`}
              >
                <span className="tabular w-6 shrink-0 text-sm text-[var(--color-text-muted)]">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                  {row.display_name}
                  {mine && (
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">you</span>
                  )}
                </span>
                {showChips && <Chip perfect={row.is_perfect} alive={row.is_alive} />}
                <span className="tabular w-14 shrink-0 text-right text-sm">
                  {row.correct_count}
                  <span className="text-[var(--color-text-muted)]">/{row.picks_possible}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!signedIn && (
        <Link
          href="/"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          Sign in to play
        </Link>
      )}
    </>
  );
}

function Chip({ perfect, alive }: { perfect: boolean; alive: boolean }) {
  if (perfect) {
    return (
      <span className="shrink-0 text-xs font-semibold uppercase text-[var(--color-correct)]">
        Perfect
      </span>
    );
  }
  if (alive) {
    return (
      <span className="shrink-0 text-xs font-semibold uppercase text-[var(--color-correct)]">
        Alive
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs uppercase text-[var(--color-text-muted)]">Out</span>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="h-9 w-1/2 rounded bg-[var(--color-surface)]" />
      <div className="mt-5 h-40 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
    </div>
  );
}
