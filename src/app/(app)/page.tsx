"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWeek } from "@/components/app/WeekProvider";
import { SignInForm } from "@/components/auth/SignInForm";
import { hubView, type HubView, type Verdict } from "@/lib/hub";
import { isGameComplete } from "@/lib/picks";
import { countdownTo, formatLockTime } from "@/lib/format";

export default function Hub() {
  const { phase, error, signedIn, profile, week, games, results, boardWeek, boardEntries, userId } =
    useWeek();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // A signed-in user with no profile has not finished signing up.
  useEffect(() => {
    if (phase === "ready" && signedIn && !profile) router.replace("/welcome");
  }, [phase, signedIn, profile, router]);

  if (phase === "loading") return <Skeleton />;
  if (phase === "error") {
    return (
      <>
        <Title>Something went wrong</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{error}</p>
      </>
    );
  }
  if (!signedIn) return <SignInForm />;
  if (!profile) return <Skeleton />;

  const completed = games.filter((g) => isGameComplete(results[g.id])).length;
  // The board only carries the current week's entries once it is locked.
  const myEntry =
    boardWeek && week && boardWeek.id === week.id
      ? boardEntries.find((e) => e.user_id === userId) ?? null
      : null;

  const view = hubView({ week, totalGames: games.length, completed, entry: myEntry });

  return (
    <>
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
        {profile.display_name}
      </p>
      <Body view={view} now={now} />
      <Link
        href="/rules"
        className="mt-10 block text-xs text-[var(--color-text-muted)] underline underline-offset-4"
      >
        Official rules
      </Link>
    </>
  );
}

function Body({ view, now }: { view: HubView; now: number }) {
  if (view.kind === "no-week") {
    return (
      <>
        <Title>No week is open yet</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          The first slate has not been loaded. Check back before Sunday.
        </p>
      </>
    );
  }

  if (view.kind === "upcoming") {
    return (
      <>
        <Title>Week {view.week.week_number} lines drop Tuesday</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Every game needs a posted line before picks open. A number that moves
          after you pick against it is a broken promise.
        </p>
        <p className="mt-6 text-xs text-[var(--color-text-muted)]">
          Locks {formatLockTime(view.week.locks_at)}
        </p>
      </>
    );
  }

  if (view.kind === "open") {
    const { label } = countdownTo(view.week.locks_at, now);
    return (
      <>
        <Title>Week {view.week.week_number}</Title>
        <p className="tabular mt-2 text-sm text-[var(--color-accent)]">{label}</p>
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          {view.allIn ? (
            <>
              Every game picked. You can change any of them until{" "}
              {formatLockTime(view.week.locks_at)}.
            </>
          ) : (
            <>
              <span className="tabular text-[var(--color-text)]">
                {view.completed} of {view.totalGames}
              </span>{" "}
              games picked. A partial entry is not scored.
            </>
          )}
        </p>
        <Link
          href="/picks"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          {view.allIn ? "Review your picks" : "Make your picks"}
        </Link>
      </>
    );
  }

  if (view.kind === "locked") {
    return (
      <>
        <Title>Picks are locked</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          All {view.totalGames * 2} of them. Nothing to do now but watch.
        </p>
        <Link
          href="/week"
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-semibold"
        >
          See your picks
        </Link>
      </>
    );
  }

  return (
    <>
      <Title>Week {view.week.week_number} final</Title>
      {view.verdict === "no-entry" ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          You did not have a complete set, so this week was not scored for you.
          All {view.possible} picks or nothing.
        </p>
      ) : (
        <>
          <p className="tabular mt-4 font-[family-name:var(--font-display)] text-5xl font-bold">
            {view.correct}
            <span className="text-[var(--color-text-muted)]">/{view.possible}</span>
          </p>
          <VerdictLine verdict={view.verdict} />
        </>
      )}
      <Link
        href="/leaderboard"
        className="mt-6 flex min-h-14 w-full items-center justify-center rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-semibold"
      >
        See the board
      </Link>
    </>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict }) {
  if (verdict === "perfect") {
    return (
      <p className="mt-2 text-sm font-semibold text-[var(--color-correct)]">
        Perfect week. Every single one.
      </p>
    );
  }
  if (verdict === "alive") {
    return (
      <p className="mt-2 text-sm font-semibold text-[var(--color-correct)]">
        Still alive.
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
      Busted. There is always next week.
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-[family-name:var(--font-display)] mt-1 text-3xl font-bold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="h-3 w-24 rounded bg-[var(--color-surface)]" />
      <div className="mt-3 h-9 w-2/3 rounded bg-[var(--color-surface)]" />
      <div className="mt-4 h-4 w-full rounded bg-[var(--color-surface)]" />
      <div className="mt-8 h-14 w-full rounded-[var(--radius-target)] bg-[var(--color-surface)]" />
    </div>
  );
}
