"use client";

import Link from "next/link";
import { useWeek } from "@/components/app/WeekProvider";
import { ShareButton } from "@/components/app/ShareButton";
import { PickSummaryRow } from "@/components/week/PickSummaryRow";
import { WeekGlance } from "@/components/week/WeekGlance";
import { isGameComplete } from "@/lib/picks";
import { formatLockTime } from "@/lib/format";
import { buildPicksShare, buildResultsShare, resultClause } from "@/lib/share";

export default function MyWeek() {
  const { phase, error, signedIn, week, games, results, teams } = useWeek();

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
        <Link href="/" className="btn btn-gold mt-6">
          Sign in
        </Link>
      </>
    );
  }

  // `upcoming` is its own state, matching the deck and the hub: a week can have
  // its games seeded before every line is posted, and showing a list of
  // "Not picked" rows against numbers that do not exist yet is a lie.
  if (!week || week.status === "upcoming" || games.length === 0) {
    return (
      <>
        <Title>Your week</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {week
            ? "Every game needs a posted line before picks open. Nothing to show until then."
            : "No slate is posted yet, so there is nothing to show."}
        </p>
      </>
    );
  }

  const graded = week.status === "scored";
  const picked = games.filter((g) => isGameComplete(results[g.id])).length;

  // Grids and rows share one ordering — kickoff — which is what lets two people
  // compare them row by row. Built from `games` so they cannot drift apart.
  const kickoffs = games.map((g) => g.kickoff_at);
  const totals = games.map((g) => results[g.id]?.totalCorrect ?? null);
  const spreads = games.map((g) => results[g.id]?.spreadCorrect ?? null);

  // Before lock there is nothing graded to show, so the share is the picks
  // themselves; from lock onward it is the results grid, which is the share the
  // product is actually pointed at.
  const locked = week.status === "locked" || graded;
  const shareLabel = locked ? "Share your week" : "Share your picks";
  const buildShare = () =>
    locked
      ? buildResultsShare({
          weekNumber: week.week_number,
          totals,
          spreads,
          correct: [...totals, ...spreads].filter((g) => g === true).length,
          possible: games.length * 2,
          clause: resultClause({ kickoffs, totals, spreads }),
        })
      : buildPicksShare(week.week_number, games, results);

  return (
    <>
      <p className="eyebrow mb-2">
        Week {week.week_number}
        {graded ? " · Final" : week.status === "locked" ? " · Locked" : " · Open"}
      </p>
      <Title>Your slate</Title>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {graded ? (
          "Final. A push counts for both sides."
        ) : week.status === "locked" ? (
          "Locked. Grades appear as games finish."
        ) : (
          // The strip below carries the count, so this carries the deadline.
          <>Locks {formatLockTime(week.locks_at)}</>
        )}
      </p>

      <WeekGlance games={games} results={results} />

      {/* Kickoff order, the same order as the glance strip above, the deck, and
          the share grid. It is what lets two people line their lists up row by
          row. */}
      <ul className="card mt-4 divide-y divide-[var(--color-border)]">
        {games.map((game) => {
          const result = results[game.id];
          return (
            <PickSummaryRow
              key={game.id}
              game={game}
              pick={result}
              team={result?.spread ? teams[result.spread] : undefined}
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

      {/* Persistent, per SPEC §7: a live share is one tap during the games,
          and the near-miss is the most shareable moment the product has. */}
      <ShareButton build={buildShare} label={shareLabel} />

      {week.status === "open" && (
        <Link href="/picks" className="btn btn-gold mt-6">
          {picked === games.length ? "Change a pick" : "Finish your picks"}
        </Link>
      )}
    </>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="h-9 w-1/2 animate-pulse rounded bg-[var(--color-surface)]" />
      <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-[var(--color-surface)]" />
      <div className="card mt-5 h-96 animate-pulse" />
    </div>
  );
}
