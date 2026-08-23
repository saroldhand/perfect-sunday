"use client";

import { accentColor } from "@/lib/teamColor";
import { formatKickoff, formatOdds, formatTotal, lineFor } from "@/lib/format";
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

  return (
    <article
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <p className="mb-3 text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
        {formatKickoff(game.kickoff_at)}
        {disabled && " · kicked off"}
      </p>

      <TeamBand team={away} />
      <div className="my-2" />
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

  // Stats are shown only once they have actually been filled in. A team whose
  // updated_through_week is null would otherwise render a confident 0-0-0,
  // which reads as a real record rather than missing data.
  const hasStats = team.updated_through_week !== null;

  return (
    <div
      className="flex items-baseline gap-3 rounded-[var(--radius-target)] bg-[var(--color-surface-raised)] py-3 pr-3 pl-3"
      style={{ borderLeft: `3px solid ${accentColor(team.primary_color)}` }}
    >
      <span className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase leading-none">
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
              className={`flex min-h-14 flex-col items-center justify-center rounded-[var(--radius-target)] border transition-colors duration-[120ms] ${
                isSelected
                  ? "border-[var(--color-accent)] bg-[var(--color-surface-raised)]"
                  : "border-[var(--color-border)] bg-transparent"
              }`}
            >
              <span
                className={`font-[family-name:var(--font-display)] text-lg font-semibold uppercase leading-none ${
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
