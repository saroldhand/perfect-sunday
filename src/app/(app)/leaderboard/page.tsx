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
      {boardWeek && (
        <p className="eyebrow mb-2">
          Week {boardWeek.week_number}
          {boardWeek.status === "scored" ? " · Final" : " · Live"}
        </p>
      )}
      <Title>The board</Title>

      {!showsCurrent && week && (week.status === "open" || week.status === "upcoming") && (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {boardWeek ? (
            <>
              Final standings. This week&rsquo;s board opens when picks lock —{" "}
              <span className="tabular text-[var(--color-accent)]">
                {countdownTo(week.locks_at, now).label}
              </span>
              .
            </>
          ) : (
            <>
              Standings open when picks lock —{" "}
              <span className="tabular text-[var(--color-accent)]">
                {countdownTo(week.locks_at, now).label}
              </span>
              . Entries are created at lock, and only for a complete set.
            </>
          )}
        </p>
      )}

      {ranked.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          {week && (week.status === "open" || week.status === "upcoming")
            ? `Nobody is on the board yet. Locks ${formatLockTime(week.locks_at)}.`
            : "No week has been played yet."}
        </p>
      ) : (
        <ul className="card mt-5 divide-y divide-[var(--color-border)]">
          {ranked.map((row) => {
            const mine = row.user_id === userId;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  mine
                    ? "border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-surface-raised)] pl-[13px]"
                    : ""
                }`}
              >
                <RankMark rank={row.rank} />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                  {row.display_name}
                  {mine && (
                    <span className="ml-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
                      you
                    </span>
                  )}
                </span>
                {showChips && <Chip perfect={row.is_perfect} alive={row.is_alive} />}
                <span className="tabular w-14 shrink-0 text-right text-sm font-semibold">
                  {row.correct_count}
                  <span className="font-normal text-[var(--color-text-muted)]">
                    /{row.picks_possible}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!signedIn && (
        <Link href="/" className="btn btn-gold mt-6">
          Sign in to play
        </Link>
      )}
    </>
  );
}

/**
 * The top three ranks read like a podium — gold, silver, bronze numerals in
 * the display face. Everyone below is a quiet number.
 */
function RankMark({ rank }: { rank: number }) {
  const medal =
    rank === 1 ? "#ffd44d" : rank === 2 ? "#c8d2e2" : rank === 3 ? "#d9995c" : null;
  return (
    <span
      className={`tabular w-7 shrink-0 font-[family-name:var(--font-display)] text-lg leading-none ${
        medal ? "font-extrabold" : "text-sm font-normal text-[var(--color-text-muted)]"
      }`}
      style={medal ? { color: medal } : undefined}
    >
      {rank}
    </span>
  );
}

function Chip({ perfect, alive }: { perfect: boolean; alive: boolean }) {
  if (perfect) {
    return (
      <span className="shrink-0 rounded-full bg-[linear-gradient(115deg,#ffd44d,#ff7a1a)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#140f06]">
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
    <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
      {children}
    </h1>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="h-9 w-1/2 animate-pulse rounded bg-[var(--color-surface)]" />
      <div className="card mt-5 h-40 animate-pulse" />
    </div>
  );
}
