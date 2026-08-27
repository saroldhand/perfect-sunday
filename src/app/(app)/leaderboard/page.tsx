"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWeek } from "@/components/app/WeekProvider";
import { getSeasonEntries } from "@/lib/entries";
import { rankEntries } from "@/lib/leaderboard";
import {
  seasonStandings,
  throughWeek,
  type RankedSeasonRow,
  type SeasonEntry,
} from "@/lib/season";
import { countdownTo, formatLockTime } from "@/lib/format";

type Tab = "week" | "season";

type SeasonState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; entries: SeasonEntry[] }
  | { status: "error"; message: string };

export default function Leaderboard() {
  const { phase, error, signedIn, userId, week, boardWeek, boardEntries } = useWeek();
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("week");
  const [season, setSeason] = useState<SeasonState>({ status: "idle" });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // The season the table describes. boardWeek covers the gap where the
  // current week is still upcoming/open and the board is showing last week.
  const seasonNumber = week?.season ?? boardWeek?.season ?? null;

  // Loaded on first entry to the tab, not with the page: the weekly board is
  // the screen people land on all week, and the season read is four tables
  // joined for a table most visits never open. Event-driven rather than an
  // effect watching `tab` — the fetch is a consequence of the tap, and this
  // repo's lint config (react-hooks/set-state-in-effect) is right to make
  // the synchronous-setState-in-effect version ugly.
  function loadSeason() {
    if (seasonNumber === null) return;
    setSeason({ status: "loading" });
    getSeasonEntries(seasonNumber)
      .then((entries) => setSeason({ status: "ready", entries }))
      .catch((err: unknown) =>
        setSeason({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }

  function openSeason() {
    setTab("season");
    if (season.status === "idle") loadSeason();
  }

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
      {tab === "week" ? (
        boardWeek && (
          <p className="eyebrow mb-2">
            Week {boardWeek.week_number}
            {boardWeek.status === "scored" ? " · Final" : " · Live"}
          </p>
        )
      ) : (
        <p className="eyebrow mb-2">Season{seasonNumber !== null && ` ${seasonNumber}`}</p>
      )}
      <Title>The board</Title>

      {seasonNumber !== null && (
        <div
          role="tablist"
          aria-label="Board scope"
          className="mt-4 flex rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
        >
          <TabButton active={tab === "week"} onClick={() => setTab("week")}>
            This week
          </TabButton>
          <TabButton active={tab === "season"} onClick={openSeason}>
            Season
          </TabButton>
        </div>
      )}

      {tab === "week" ? (
        <>
          {!showsCurrent && week && (week.status === "open" || week.status === "upcoming") && (
            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
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
            <ul className="card mt-4 divide-y divide-[var(--color-border)]">
              {ranked.map((row) => (
                <BoardRow
                  key={row.user_id}
                  rank={row.rank}
                  name={row.display_name}
                  mine={row.user_id === userId}
                  score={row.correct_count}
                  possible={row.picks_possible}
                  chip={
                    showChips ? (
                      <WeekChip perfect={row.is_perfect} alive={row.is_alive} />
                    ) : null
                  }
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <SeasonBoard state={season} userId={userId} onRetry={loadSeason} />
      )}

      {!signedIn && (
        <Link href="/" className="btn btn-gold mt-6">
          Sign in to play
        </Link>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 flex-1 rounded-[calc(var(--radius-target)-4px)] text-sm font-semibold transition-colors duration-[120ms] ${
        active
          ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
          : "text-[var(--color-text-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

function SeasonBoard({
  state,
  userId,
  onRetry,
}: {
  state: SeasonState;
  userId: string | null;
  onRetry: () => void;
}) {
  if (state.status === "idle" || state.status === "loading") {
    return <div aria-hidden className="card mt-4 h-40 animate-pulse" />;
  }

  if (state.status === "error") {
    return (
      <p className="mt-6 text-sm text-[var(--color-text-muted)]">
        Could not load the season table:{" "}
        <span className="text-[var(--color-text)]">{state.message}</span>{" "}
        <button
          type="button"
          onClick={onRetry}
          className="text-[var(--color-accent)] underline underline-offset-4"
        >
          Try again
        </button>
      </p>
    );
  }

  const rows = seasonStandings(state.entries);

  if (rows.length === 0) {
    return (
      <p className="mt-6 text-sm text-[var(--color-text-muted)]">
        The season table starts once the first week is scored. Every scored
        week you complete counts — bust a week and the total still grows.
      </p>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm text-[var(--color-text-muted)]">
        Through week {throughWeek(state.entries)}. Every scored week summed;
        ties break on weeks played.
      </p>
      <ul className="card mt-4 divide-y divide-[var(--color-border)]">
        {rows.map((row) => (
          <BoardRow
            key={row.user_id}
            rank={row.rank}
            name={row.display_name}
            mine={row.user_id === userId}
            score={row.total_correct}
            possible={row.total_possible}
            chip={<SeasonChip row={row} />}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * One line of either board. Weekly and season rows share the grammar — rank,
 * name, chip, tabular score — so switching tabs reads as the same table over
 * a different window, not a different screen.
 */
function BoardRow({
  rank,
  name,
  mine,
  score,
  possible,
  chip,
}: {
  rank: number;
  name: string;
  mine: boolean;
  score: number;
  possible: number;
  chip: React.ReactNode;
}) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        mine
          ? "border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-surface-raised)] pl-[13px]"
          : ""
      }`}
    >
      <RankMark rank={rank} />
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
        {name}
        {mine && (
          <span className="ml-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
            you
          </span>
        )}
      </span>
      {chip}
      <span className="tabular w-14 shrink-0 text-right text-sm font-semibold">
        {score}
        <span className="font-normal text-[var(--color-text-muted)]">/{possible}</span>
      </span>
    </li>
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

function WeekChip({ perfect, alive }: { perfect: boolean; alive: boolean }) {
  if (perfect) return <PerfectChip />;
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

/**
 * Weeks played, stated because it is the tiebreak — two equal totals rank by
 * it, and a number that silently decides the order would read as a bug. A
 * perfect week outranks it for the slot: rare enough to always be the story.
 */
function SeasonChip({ row }: { row: RankedSeasonRow }) {
  if (row.perfect_weeks > 0) {
    return <PerfectChip count={row.perfect_weeks} />;
  }
  return (
    <span className="tabular shrink-0 text-xs uppercase text-[var(--color-text-muted)]">
      {row.weeks_played} wk{row.weeks_played === 1 ? "" : "s"}
    </span>
  );
}

function PerfectChip({ count }: { count?: number }) {
  return (
    <span className="shrink-0 rounded-full bg-[linear-gradient(115deg,#ffd44d,#ff7a1a)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#140f06]">
      Perfect{count !== undefined && count > 1 ? ` ×${count}` : ""}
    </span>
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
