"use client";

import { buildGlance, describePips, type PipState } from "@/lib/glance";
import type { ResultMap } from "@/lib/picks";
import type { Game } from "@/lib/week";

const PIP_CLASS: Record<PipState, string> = {
  empty: "",
  picked: "pip-picked",
  correct: "pip-correct",
  wrong: "pip-wrong",
};

/**
 * The whole week in two rows: one pip per game, totals above spreads, in the
 * order the games kick off. It is the on-screen twin of the grid the share
 * builds, so what you look at all week and what you post afterwards are the
 * same object.
 */
export function WeekGlance({
  games,
  results,
}: {
  games: Game[];
  results: ResultMap;
}) {
  const glance = buildGlance(games, results);

  // Once anything is graded the count that matters is how many you got, out of
  // how many have actually been decided. Before that it is how many are in.
  const scoring = glance.graded > 0;

  return (
    <section className="card mt-5 px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="eyebrow">At a glance</p>
        <p className="flex items-baseline gap-1.5">
          <span className="tabular font-[family-name:var(--font-display)] text-3xl font-black leading-none">
            {scoring ? glance.correct : glance.picked}
          </span>
          <span className="tabular text-sm text-[var(--color-text-muted)]">
            /{scoring ? glance.graded : glance.possible}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            {scoring ? "correct" : "in"}
          </span>
        </p>
      </div>

      <PipRow label="Tot" name="Totals" pips={glance.totals} />
      <PipRow label="Spr" name="Spreads" pips={glance.spreads} />
    </section>
  );
}

function PipRow({
  label,
  name,
  pips,
}: {
  label: string;
  /** The spoken form of the label, for the row's description. */
  name: string;
  pips: PipState[];
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2.5">
      <span className="w-7 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </span>
      {/* One image with one description, rather than sixteen unlabelled boxes
          a screen reader would have to walk through. */}
      <div role="img" aria-label={describePips(name, pips)} className="flex flex-1 gap-1">
        {pips.map((state, index) => (
          <span key={index} aria-hidden className={`pip ${PIP_CLASS[state]}`} />
        ))}
      </div>
    </div>
  );
}
