"use client";

import { accentColor } from "@/lib/teamColor";
import {
  formatKickoff,
  formatOdds,
  formatTotal,
  lineFor,
  statsProvenance,
} from "@/lib/format";
import type { Pick, TotalSide } from "@/lib/picks";
import type { Game, Team } from "@/lib/week";

type Props = {
  game: Game;
  teams: Record<string, Team>;
  pick?: Pick;
  onPickTotal: (side: TotalSide) => void;
  onPickSpread: (team: string) => void;
  disabled: boolean;
};

export function GameCard({
  game,
  teams,
  pick,
  onPickTotal,
  onPickSpread,
  disabled,
}: Props) {
  const away = teams[game.away_team];
  const home = teams[game.home_team];

  // Both clubs' stats come from the same load, so the season is stated once for
  // the card rather than repeated on each band.
  const statsLabel =
    (away && statsProvenance(away)) ?? (home && statsProvenance(home)) ?? null;

  return (
    <article className={`card p-4 ${disabled ? "opacity-40" : ""}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="eyebrow">
          {formatKickoff(game.kickoff_at)}
          {disabled && " · kicked off"}
        </p>
        {statsLabel && <p className="eyebrow shrink-0">{statsLabel}</p>}
      </div>

      <TeamBand team={away} />
      <p
        aria-hidden
        className="my-1.5 pl-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]"
      >
        at
      </p>
      <TeamBand team={home} />

      {/* Total first, then spread — same order the share grid uses, so the
          card and the grid agree about which block is which. */}
      <PickRow
        label="Total"
        hint={game.total === null ? "No line" : `O/U ${formatTotal(game.total)}`}
        options={[
          {
            value: "OVER",
            label: "Over",
            detail: `${formatTotal(game.total)}  ${formatOdds(game.over_odds)}`,
          },
          {
            value: "UNDER",
            label: "Under",
            detail: `${formatTotal(game.total)}  ${formatOdds(game.under_odds)}`,
          },
        ]}
        selected={pick?.total ?? null}
        onSelect={(value) => onPickTotal(value as TotalSide)}
        disabled={disabled}
      />

      <PickRow
        label="Spread"
        hint="Who covers"
        options={[
          {
            value: game.away_team,
            label: game.away_team,
            detail: lineFor(game.spread, "away"),
          },
          {
            value: game.home_team,
            label: game.home_team,
            detail: lineFor(game.spread, "home"),
          },
        ]}
        selected={pick?.spread ?? null}
        onSelect={onPickSpread}
        disabled={disabled}
      />
    </article>
  );
}

function TeamBand({ team }: { team?: Team }) {
  if (!team) return null;

  // Stats are shown only once they have actually been filled in AND carry the
  // season they belong to. A team whose stats are unset would otherwise render
  // a confident 0-0-0, and one whose season is unknown would print last year's
  // record as though it were this year's.
  const hasStats = statsProvenance(team) !== null;

  const color = accentColor(team.primary_color);

  return (
    <div
      className="flex items-baseline gap-3 rounded-[var(--radius-target)] py-3 pr-3 pl-3"
      style={{
        borderLeft: `4px solid ${color}`,
        // The club's colour as a wash fading out to the right — the matchup
        // graphic treatment, not a hairline that apologises for itself.
        background: `linear-gradient(90deg, ${color}2E, ${color}05 65%), var(--color-surface-raised)`,
      }}
    >
      <span className="font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-none">
        {team.abbr}
      </span>
      <span className="text-sm text-[var(--color-text-muted)]">{team.name}</span>
      {hasStats && (
        <span className="tabular ml-auto text-xs text-[var(--color-text-muted)]">
          {team.wins}-{team.losses}
          {team.ties > 0 ? `-${team.ties}` : ""} · {team.ppg ?? "—"} PF ·{" "}
          {team.papg ?? "—"} PA
        </span>
      )}
    </div>
  );
}

function PickRow({
  label,
  hint,
  options,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  hint: string;
  options: { value: string; label: string; detail: string }[];
  selected: string | null;
  onSelect: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="tabular text-xs text-[var(--color-text-muted)]">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(option.value)}
              className={`pick-option flex min-h-14 flex-col items-center justify-center rounded-[var(--radius-target)] border transition-colors duration-[120ms] ${
                isSelected
                  ? "border-[var(--color-accent)] bg-[rgba(255,180,36,0.10)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-raised)]/40"
              }`}
            >
              <span
                className={`font-[family-name:var(--font-display)] text-xl font-bold uppercase leading-none ${
                  isSelected ? "text-[var(--color-accent)]" : ""
                }`}
              >
                {option.label}
              </span>
              <span className="tabular mt-1 text-xs text-[var(--color-text-muted)]">
                {option.detail}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
