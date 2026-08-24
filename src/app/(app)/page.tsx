"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWeek } from "@/components/app/WeekProvider";
import { ShareButton } from "@/components/app/ShareButton";
import { SignInForm } from "@/components/auth/SignInForm";
import { landingRoute } from "@/lib/profile";
import { hubView, type HubView, type Verdict } from "@/lib/hub";
import { isGameComplete } from "@/lib/picks";
import { rankEntries } from "@/lib/leaderboard";
import { buildPicksShare } from "@/lib/share";
import { clockTo, formatLockTime, ordinal } from "@/lib/format";

export default function Hub() {
  const { phase, error, signedIn, profile, week, games, results, boardWeek, boardEntries, userId } =
    useWeek();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  // One second, not thirty: the open-week countdown ticks live, and the sweat
  // of a moving clock is exactly the pull this screen exists to create.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A signed-in user with no profile has not finished signing up; one whose
  // accepted rules are out of date needs the gate again rather than having the
  // new version applied silently. landingRoute owns both rules.
  useEffect(() => {
    if (phase === "ready" && signedIn && landingRoute(profile) !== "/") {
      router.replace("/welcome");
    }
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
  // The `!profile ||` is redundant at runtime — landingRoute(null) is always
  // "/welcome" — but it is what lets TypeScript narrow profile below, since it
  // cannot see through the landingRoute call on its own.
  if (!profile || landingRoute(profile) !== "/") return <Skeleton />;

  const completed = games.filter((g) => isGameComplete(results[g.id])).length;
  // The board only carries the current week's entries once it is locked.
  const myEntry =
    boardWeek && week && boardWeek.id === week.id
      ? boardEntries.find((e) => e.user_id === userId) ?? null
      : null;

  // Computed rather than taken from games[0]: the query happens to order by
  // kickoff, but the countdown should not silently move if that ordering ever
  // changes.
  const firstKickoff =
    games.length === 0
      ? null
      : games.reduce(
          (earliest, g) =>
            Date.parse(g.kickoff_at) < Date.parse(earliest) ? g.kickoff_at : earliest,
          games[0].kickoff_at,
        );

  const myRank =
    rankEntries(boardEntries).find((row) => row.user_id === userId)?.rank ?? null;

  const view = hubView({
    week,
    totalGames: games.length,
    completed,
    entry: myEntry,
    firstKickoff,
    rank: myRank,
    fieldSize: boardEntries.length,
  });

  const shareTextFor = () =>
    buildPicksShare(
      week?.week_number ?? 0,
      games.map((g) => results[g.id]?.total ?? null),
      games.map((g) => results[g.id]?.spread ?? null),
    );

  return (
    <>
      <Body view={view} now={now} share={shareTextFor} />
      <Link
        href="/rules"
        className="mt-10 block text-xs text-[var(--color-text-muted)] underline underline-offset-4"
      >
        Official rules
      </Link>
    </>
  );
}

function Body({
  view,
  now,
  share,
}: {
  view: HubView;
  now: number;
  share: () => string;
}) {
  if (view.kind === "no-week") {
    return (
      <section className="billboard rise">
        <p className="eyebrow">Preseason</p>
        <Title>No slate yet</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          The first slate has not been loaded. Check back before Sunday.
        </p>
      </section>
    );
  }

  if (view.kind === "upcoming") {
    return (
      <section className="billboard rise">
        <p className="eyebrow">Week {view.week.week_number}</p>
        <Title>Lines drop Tuesday</Title>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Every game needs a posted line before picks open. A number that moves
          after you pick against it is a broken promise.
        </p>
        <p className="tabular mt-6 text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Locks {formatLockTime(view.week.locks_at)}
        </p>
      </section>
    );
  }

  if (view.kind === "open") {
    const clock = clockTo(view.week.locks_at, now);
    const pct = view.totalGames === 0 ? 0 : Math.round((view.completed / view.totalGames) * 100);
    return (
      <section className="billboard rise">
        <p className="eyebrow">Week {view.week.week_number} · Picks open</p>
        <div className="mt-4">
          <TickingClock clock={clock.clock} days={clock.days} label="until lines lock" />
          <p className="mt-1 text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Until lines lock · {formatLockTime(view.week.locks_at)}
          </p>
        </div>

        <div className="mt-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#ffd44d,#ff7a1a)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {view.allIn ? (
              <>Every game picked. You can change any of them until the lock.</>
            ) : (
              <>
                <span className="tabular font-semibold text-[var(--color-text)]">
                  {view.completed} of {view.totalGames}
                </span>{" "}
                games picked. A partial entry is not scored.
              </>
            )}
          </p>
        </div>

        {view.allIn ? (
          // Once the set is complete, sharing is the next thing worth doing —
          // so it takes the primary button and changing picks steps back.
          <>
            <ShareButton build={share} label="Share your picks" />
            <Link href="/picks" className="btn btn-ghost mt-3">
              Change your picks
            </Link>
          </>
        ) : (
          <Link href="/picks" className="btn btn-gold mt-6">
            Make your picks
          </Link>
        )}
      </section>
    );
  }

  if (view.kind === "locked") {
    // The stretch between Thursday lock and Sunday kickoff is the longest the
    // app ever asks anyone to wait. A clock is the only thing this screen can
    // honestly offer in it.
    const kickoff = view.firstKickoff ? clockTo(view.firstKickoff, now) : null;
    return (
      <section className="billboard rise">
        <p className="eyebrow">Week {view.week.week_number} · Locked</p>

        {kickoff && !kickoff.expired ? (
          <div className="mt-4">
            <TickingClock
              clock={kickoff.clock}
              days={kickoff.days}
              label="until first kickoff"
            />
            <p className="mt-1 text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Until first kickoff
            </p>
          </div>
        ) : (
          <Title>
            {kickoff
              ? "Under way"
              : view.hasEntry
                ? "Picks are locked"
                : "This week is locked"}
          </Title>
        )}

        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {view.hasEntry
            ? `Your ${view.totalGames * 2} picks are in. Nothing to do now but watch.`
            : "You did not have a complete set before the lock, so you are not in this week. A partial entry is never scored."}
        </p>

        {view.hasEntry && <ShareButton build={share} label="Share your picks" />}
        <Link
          href="/week"
          className={`btn btn-ghost ${view.hasEntry ? "mt-3" : "mt-6"}`}
        >
          See your picks
        </Link>
      </section>
    );
  }

  return (
    <section className="billboard rise">
      <p className="eyebrow">Week {view.week.week_number} · Final</p>
      {view.verdict === "no-entry" ? (
        <>
          <Title>Not scored</Title>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            You did not have a complete set, so this week was not scored for
            you. All {view.possible} picks or nothing.
          </p>
        </>
      ) : (
        <>
          <p className="tabular mt-3 font-[family-name:var(--font-display)] text-7xl font-black uppercase leading-none">
            {view.verdict === "perfect" ? (
              <span className="text-gold">{view.correct}</span>
            ) : (
              view.correct
            )}
            <span className="text-4xl text-[var(--color-text-muted)]">/{view.possible}</span>
          </p>
          <VerdictLine verdict={view.verdict} />
        </>
      )}
      {view.rank !== null && (
        <p className="tabular mt-3 text-sm text-[var(--color-text-muted)]">
          {ordinal(view.rank)} of {view.fieldSize} on the board
        </p>
      )}
      <Link href="/leaderboard" className="btn btn-ghost mt-6">
        See the board
      </Link>
    </section>
  );
}

/**
 * Each digit sits in its own fixed-width box so the clock does not jitter as
 * it ticks — the display face has no tabular figures to lean on.
 */
function TickingClock({
  clock,
  days,
  label,
}: {
  clock: string;
  days: number;
  /** What the clock counts down to, for the screen reader. Passed in because
   *  this now serves both the lock and the first kickoff. */
  label: string;
}) {
  return (
    <p
      className="flex items-baseline font-[family-name:var(--font-display)] text-6xl font-black leading-none"
      aria-label={`${days > 0 ? `${days} days ` : ""}${clock} ${label}`}
    >
      {days > 0 && (
        <span className="mr-3">
          {days}
          <span className="text-3xl text-[var(--color-text-muted)]">d</span>
        </span>
      )}
      {clock.split("").map((ch, i) =>
        ch === ":" ? (
          <span key={i} className="w-[0.3em] text-center text-[var(--color-accent)]">
            :
          </span>
        ) : (
          <span key={i} className="inline-block w-[0.62em] text-center">
            {ch}
          </span>
        ),
      )}
    </p>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict }) {
  if (verdict === "perfect") {
    return (
      <p className="mt-3 text-sm font-semibold text-[var(--color-correct)]">
        Perfect week. Every single one.
      </p>
    );
  }
  if (verdict === "alive") {
    return (
      <p className="mt-3 text-sm font-semibold text-[var(--color-correct)]">
        Still alive.
      </p>
    );
  }
  return (
    <p className="mt-3 text-sm text-[var(--color-text-muted)]">
      Busted. There is always next week.
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="billboard h-64 animate-pulse border-[var(--color-border)]" />
    </div>
  );
}
