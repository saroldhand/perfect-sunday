"use client";

import { accentColor } from "@/lib/teamColor";
import { formatKickoff, formatOdds, lineFor } from "@/lib/format";
import type { Game, Team } from "@/lib/week";

type Props = {
  game: Game;
  teams: Record<string, Team>;
  pick?: { moneyline: string | null; spread: string | null };
  onPick: (kind: "moneyline" | "spread", team: string) => void;
  disabled: boolean;
};

export function GameCard({ game, teams, pick, onPick, disabled }: Props) {
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

      <PickRow
        label="Moneyline"
        hint="Who wins"
        options={[
          {
            team: game.away_team,
            detail: formatOdds(game.moneyline_away),
          },
          {
            team: game.home_team,
            detail: formatOdds(game.moneyline_home),
          },
        ]}
        selected={pick?.moneyline ?? null}
        onSelect={(team) => onPick("moneyline", team)}
        disabled={disabled}
      />

      <PickRow
        label="Spread"
        hint="Who covers"
        options={[
          {
            team: game.away_team,
            detail: lineFor(game.spread, "away"),
          },
          {
            team: game.home_team,
            detail: lineFor(game.spread, "home"),
          },
        ]}
        selected={pick?.spread ?? null}
        onSelect={(team) => onPick("spread", team)}
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
  options: { team: string; detail: string }[];
  selected: string | null;
  onSelect: (team: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const isSelected = selected === option.team;
          return (
            <button
              key={option.team}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(option.team)}
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
                {option.team}
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
