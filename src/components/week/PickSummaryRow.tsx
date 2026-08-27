"use client";

import { useState } from "react";
import { accentColor } from "@/lib/teamColor";
import { lineFor, formatKickoff, formatTotal } from "@/lib/format";
import type { Pick } from "@/lib/picks";
import type { Game, Team } from "@/lib/week";

export type Grade = { total: boolean | null; spread: boolean | null };
export type Score = {
  home: number | null;
  away: number | null;
  /** Distinguishes "Final 24–17" from a game still running, whose score
   *  shows bare — moving numbers are their own "live" label. */
  final: boolean;
};

type Props = {
  game: Game;
  pick: Pick | undefined;
  /** The club backed on the spread. Supplies the row's colour; omitted before
   *  a spread is picked, which is what makes an untouched row read as blank. */
  team?: Team;
  /** Omitted before scoring. A null field means that side is not graded yet. */
  grade?: Grade;
  score?: Score;
  /** Supplied by the review screen, where a row jumps back to its card. */
  onJump?: () => void;
};

/**
 * One game's line in a list of picks. Shared by the review screen and My Week
 * so the two cannot drift apart the next time a line format changes.
 *
 * Each side of the game is its own chip rather than a clause in a sentence:
 * the chip carries the club's colour, and once graded it carries the verdict
 * in its own border and fill, which reads at arm's length in a way an inline
 * tick never did.
 */
export function PickSummaryRow({ game, pick, team, grade, score, onJump }: Props) {
  const color = team ? accentColor(team.primary_color) : null;

  // Away first, matching the "AWAY @ HOME" order the row reads in.
  const scoreline =
    score && score.home !== null && score.away !== null
      ? `${score.final ? "Final " : ""}${score.away}–${score.home}`
      : null;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-[family-name:var(--font-display)] text-lg font-bold uppercase leading-none">
          {game.away_team}{" "}
          <span className="text-[var(--color-text-muted)]">@</span> {game.home_team}
        </span>
        <span className="tabular shrink-0 text-xs text-[var(--color-text-muted)]">
          {scoreline ?? formatKickoff(game.kickoff_at)}
        </span>
      </div>

      {/* Total first, then spread — the order the card and the share grid both
          use, so all three agree about which block is which. */}
      <div className="mt-2 flex gap-2">
        <PickChip
          label={pick?.total ? (pick.total === "OVER" ? "Over" : "Under") : "Total"}
          detail={game.total === null ? undefined : formatTotal(game.total)}
          grade={grade?.total}
          chosen={Boolean(pick?.total)}
        />
        <PickChip
          label={pick?.spread ?? "Spread"}
          detail={
            pick?.spread
              ? lineFor(game.spread, pick.spread === game.home_team ? "home" : "away")
              : undefined
          }
          grade={grade?.spread}
          chosen={Boolean(pick?.spread)}
        />
      </div>
    </>
  );

  // A 3px edge either way, so a coloured row and a blank one still line up.
  const shell = {
    borderLeftColor: color ?? "transparent",
    background: color ? `linear-gradient(90deg, ${color}24, transparent 60%)` : undefined,
  };

  if (onJump) {
    return (
      <li>
        <button
          type="button"
          onClick={onJump}
          style={shell}
          className="block w-full border-l-[3px] px-4 py-3 text-left"
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li style={shell} className="border-l-[3px] px-4 py-3">
      {body}
    </li>
  );
}

/**
 * One side of one game.
 *
 * A push — a combined score landing exactly on the total, or a spread landing
 * exactly on the number — is recorded as correct for both sides. It reads as
 * correct here, not as a third state: inventing one would contradict both the
 * database and the rules page.
 */
function PickChip({
  label,
  detail,
  grade,
  chosen,
}: {
  label: string;
  detail?: string;
  grade?: boolean | null;
  chosen: boolean;
}) {
  const graded = chosen && grade !== undefined && grade !== null;

  // A chip that resolves while it is on screen gets one brief pulse — the
  // signature moment the live refresh exists to deliver. It is keyed off the
  // ungraded→graded *transition*, not the graded state: a list opened Monday
  // morning is already fully graded and must stay still. Render-time state
  // adjustment rather than an effect, same pattern (and lint rule) as
  // WeekProvider's identity reset.
  const [wasGraded, setWasGraded] = useState(graded);
  const [resolved, setResolved] = useState(false);
  if (graded !== wasGraded) {
    setWasGraded(graded);
    if (graded) setResolved(true);
  }

  const shell = !chosen
    ? "pick-chip-empty"
    : graded
      ? grade
        ? "pick-chip-correct"
        : "pick-chip-wrong"
      : "";

  const text = !chosen
    ? "text-[var(--color-text-muted)]"
    : graded
      ? grade
        ? "text-[var(--color-correct)]"
        : "text-[var(--color-wrong)]"
      : "";

  return (
    <span
      className={`pick-chip min-w-0 flex-1 justify-center ${shell} ${
        resolved ? "pick-chip-resolve" : ""
      }`}
      aria-label={graded ? `${label}, ${grade ? "correct" : "wrong"}` : undefined}
    >
      <span
        className={`truncate font-[family-name:var(--font-display)] text-base font-bold uppercase leading-none ${text}`}
      >
        {label}
      </span>
      {detail && (
        <span className="tabular shrink-0 text-xs text-[var(--color-text-muted)]">
          {detail}
        </span>
      )}
    </span>
  );
}
