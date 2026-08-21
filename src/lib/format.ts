// American odds always carry their sign: +150 pays, -180 risks.
export function formatOdds(odds: number | null): string {
  if (odds === null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/**
 * `spread` on a game is the home team's line, so the away side is its
 * negation. Returned with an explicit sign because "CIN -3.5" and "BAL +3.5"
 * only mean anything together.
 */
export function lineFor(spread: number | null, side: "home" | "away"): string {
  if (spread === null) return "—";
  const value = side === "home" ? spread : -spread;
  const rounded = Math.abs(value) % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}

const KICKOFF_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

/** Kickoffs are always shown in Eastern — the league's clock, and the one the
 *  lock time is defined against. Showing a user's local time would make two
 *  people in different zones disagree about when the slate locks. */
export function formatKickoff(iso: string): string {
  return KICKOFF_FORMAT.format(new Date(iso));
}

export type Countdown = {
  expired: boolean;
  label: string;
};

export function countdownTo(iso: string, now: number): Countdown {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { expired: true, label: "Picks are locked" };

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return { expired: false, label: `${days}d ${hours}h to lock` };
  if (hours > 0) return { expired: false, label: `${hours}h ${minutes}m to lock` };
  return { expired: false, label: `${minutes}m to lock` };
}

const LOCK_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

// The lock time is always displayed rather than assumed, so an early lock —
// Thanksgiving, Christmas, a Saturday-heavy week — never surprises anyone.
export function formatLockTime(iso: string): string {
  return LOCK_FORMAT.format(new Date(iso));
}
