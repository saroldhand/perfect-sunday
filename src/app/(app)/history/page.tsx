"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWeek } from "@/components/app/WeekProvider";
import { PickSummaryRow } from "@/components/week/PickSummaryRow";
import { buildGlance } from "@/lib/glance";
import { spansSeasons, toHistoryWeeks, type HistoryWeek } from "@/lib/history";
import { getHistoryPicks } from "@/lib/picks";

/**
 * Previous weeks — every week already gone by that the user has picks in.
 *
 * Loaded here rather than in WeekProvider, which is the opposite of the choice
 * the three original tabs made and deliberately so: those three share one
 * week's data, so fetching per screen would have refetched it on every tab
 * switch. This dataset is every pick the user has ever made, it is needed by
 * this screen alone, and it is the one screen where nothing is still moving —
 * so paying for it on arrival beats making the other three wait for it.
 */
export default function Previous() {
  const { phase, signedIn, userId, week, teams } = useWeek();

  // One piece of state, not two, and written only from the load's callbacks:
  // this repo's lint config forbids setState in an effect body (see the note
  // in WeekProvider), and a single object keeps weeks and error from ever
  // disagreeing. Null means the first load has not landed.
  const [load, setLoad] = useState<{
    weeks: HistoryWeek[];
    error: string | null;
  } | null>(null);

  // The current week is excluded, so this has to re-run when the current week
  // changes — the Thursday a week locks, what Previous should show moves too.
  const currentWeekId = week?.id;

  useEffect(() => {
    // Signed out needs no fetch and no state: `signedIn` is false whenever
    // userId is null, so the sign-in branch below is already what renders.
    if (!userId) return;

    let active = true;

    getHistoryPicks(userId)
      .then((rows) => {
        if (!active) return;
        setLoad({
          weeks: toHistoryWeeks(rows, Date.now(), currentWeekId),
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoad({
          weeks: [],
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      active = false;
    };
  }, [userId, currentWeekId]);

  if (phase === "loading") return <Skeleton />;

  if (!signedIn) {
    return (
      <>
        <Title>Previous weeks</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Sign in to look back at your picks.
        </p>
        <Link href="/" className="btn btn-gold mt-6">
          Sign in
        </Link>
      </>
    );
  }

  if (load === null) return <Skeleton />;

  if (load.error) {
    return (
      <>
        <Title>Previous weeks</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{load.error}</p>
      </>
    );
  }

  const weeks = load.weeks;

  if (weeks.length === 0) {
    return (
      <>
        <Title>Previous weeks</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Nothing to look back on yet. Once a week locks, it lands here with
          every pick you made in it.
        </p>
      </>
    );
  }

  const showSeason = spansSeasons(weeks);

  return (
    <>
      <p className="eyebrow mb-2">
        {weeks.length} {weeks.length === 1 ? "week" : "weeks"}
      </p>
      <Title>Previous weeks</Title>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Every week you have played, newest first. A push counts for both sides.
      </p>

      {/* Newest expanded, the rest collapsed: the week someone came looking for
          is nearly always the one just gone, and eighteen open lists of sixteen
          games each would bury it. */}
      {weeks.map((entry, index) => (
        <WeekCard
          key={entry.week.id}
          entry={entry}
          teams={teams}
          showSeason={showSeason}
          initiallyOpen={index === 0}
        />
      ))}
    </>
  );
}

function WeekCard({
  entry,
  teams,
  showSeason,
  initiallyOpen,
}: {
  entry: HistoryWeek;
  teams: ReturnType<typeof useWeek>["teams"];
  showSeason: boolean;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const { week, games, results } = entry;
  const glance = buildGlance(games, results);

  // Same rule as the glance strip: once anything is graded the number that
  // matters is how many you got out of how many have been decided. Before
  // that it is how many are in.
  const scoring = glance.graded > 0;

  return (
    <section className="card mt-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span>
          <span className="eyebrow block">
            {showSeason ? `${week.season} · ` : ""}
            {label(week.status)}
          </span>
          <span className="mt-0.5 block font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase leading-none">
            Week {week.week_number}
          </span>
        </span>

        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="tabular font-[family-name:var(--font-display)] text-3xl font-black leading-none">
            {scoring ? glance.correct : glance.picked}
          </span>
          <span className="tabular text-sm text-[var(--color-text-muted)]">
            /{scoring ? glance.graded : glance.possible}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            {scoring ? "correct" : "in"}
          </span>
          <span
            aria-hidden
            className={`ml-1 text-[var(--color-text-muted)] transition-transform ${
              open ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </span>
      </button>

      {open && (
        <ul className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
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
                  game.status !== "scheduled"
                    ? {
                        home: game.home_score,
                        away: game.away_score,
                        final: game.status === "final",
                      }
                    : undefined
                }
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * A past week's status, said plainly.
 *
 * `previous` is the status for a week that went by without being played, and
 * it only reaches this screen if the user somehow has picks in one — which
 * 2026 Week 1, the week that status exists for, does not. `upcoming` reaching
 * here would mean a week whose lock passed before it ever opened. Both read
 * as "Not played", which is the honest answer: there was never a locked slate
 * to grade against.
 */
function label(status: HistoryWeek["week"]["status"]): string {
  switch (status) {
    case "scored":
      return "Final";
    case "locked":
      return "Grading";
    case "open":
      return "Open";
    case "previous":
    case "upcoming":
      return "Not played";
  }
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
      <div className="h-9 w-2/3 animate-pulse rounded bg-[var(--color-surface)]" />
      <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-[var(--color-surface)]" />
      <div className="card mt-5 h-20 animate-pulse" />
      <div className="card mt-4 h-20 animate-pulse" />
    </div>
  );
}
