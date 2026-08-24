"use client";

import Link from "next/link";
import { useWeek } from "@/components/app/WeekProvider";
import { PickSummaryRow } from "@/components/week/PickSummaryRow";
import { formatLockTime } from "@/lib/format";

export default function MyWeek() {
  const { phase, error, signedIn, week, games, results } = useWeek();

  if (phase === "loading") return <Skeleton />;
  if (phase === "error") {
    return (
      <>
        <Title>Something went wrong</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{error}</p>
      </>
    );
  }

  if (!signedIn) {
    return (
      <>
        <Title>Your week</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Sign in to see your picks.
        </p>
        <Link
          href="/"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          Sign in
        </Link>
      </>
    );
  }

  if (!week || games.length === 0) {
    return (
      <>
        <Title>Your week</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          No slate is posted yet, so there is nothing to show.
        </p>
      </>
    );
  }

  const graded = week.status === "scored";
  const picked = games.filter((g) => results[g.id]?.total && results[g.id]?.spread).length;

  return (
    <>
      <Title>Week {week.week_number}</Title>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {graded ? (
          "Final. A push counts for both sides."
        ) : week.status === "locked" ? (
          "Locked. Grades appear as games finish."
        ) : (
          <>
            <span className="tabular text-[var(--color-text)]">
              {picked} of {games.length}
            </span>{" "}
            picked · locks {formatLockTime(week.locks_at)}
          </>
        )}
      </p>

      {/* Kickoff order, the same order as the deck and the share grid. It is
          what lets two people line their lists up row by row. */}
      <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {games.map((game, index) => {
          const result = results[game.id];
          return (
            <PickSummaryRow
              key={game.id}
              index={index}
              game={game}
              pick={result}
              grade={
                result
                  ? { total: result.totalCorrect, spread: result.spreadCorrect }
                  : undefined
              }
              score={
                game.status === "final"
                  ? { home: game.home_score, away: game.away_score }
                  : undefined
              }
            />
          );
        })}
      </ul>

      {week.status === "open" && (
        <Link
          href="/picks"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          {picked === games.length ? "Change a pick" : "Finish your picks"}
        </Link>
      )}
    </>
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
      <div className="mt-3 h-4 w-2/3 rounded bg-[var(--color-surface)]" />
      <div className="mt-5 h-96 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
    </div>
  );
}
