// American odds always carry their sign: +150 pays, -180 risks.
export function formatOdds(odds: number | null): string {
  if (odds === null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** The over/under number itself, e.g. 44.5. */
export function formatTotal(total: number | null): string {
  if (total === null) return "—";
  return total % 1 === 0 ? total.toFixed(0) : total.toFixed(1);
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
  if (ms <= 0) return { expired: true, label: "Locking now" };

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return { expired: false, label: `${days}d ${hours}h to lock` };
  if (hours > 0) return { expired: false, label: `${hours}h ${minutes}m to lock` };
  return { expired: false, label: `${minutes}m to lock` };
}

export type Clock = {
  expired: boolean;
  days: number;
  /** "HH:MM:SS" once under a day, "MM:SS" under an hour — the ticking form. */
  clock: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The hub's live countdown. Under a day it ticks in seconds — the sweat is
 * the point — and above a day it leads with the day count instead, because
 * "3d" plus a ticking clock reads as noise, not urgency.
 */
export function clockTo(iso: string, now: number): Clock {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { expired: true, days: 0, clock: "00:00" };

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return { expired: false, days, clock: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` };
  if (hours > 0) return { expired: false, days: 0, clock: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` };
  return { expired: false, days: 0, clock: `${pad(minutes)}:${pad(seconds)}` };
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

/**
 * Which season a club's record and scoring averages describe, phrased the way
 * the card prints it: "2025 final" or "2026 thru wk 3".
 *
 * In Week 1 the only numbers that exist are last season's, and a record set
 * flat beside a matchup reads as this year's form. Naming the season is what
 * keeps that honest. Returns null when the stats carry no provenance, which is
 * the card's signal to show no numbers at all rather than unlabelled ones.
 */
export function statsProvenance(team: {
  stats_season: number | null;
  updated_through_week: number | null;
}): string | null {
  if (team.stats_season === null || team.updated_through_week === null) {
    return null;
  }
  return team.updated_through_week >= REGULAR_SEASON_WEEKS
    ? `${team.stats_season} final`
    : `${team.stats_season} thru wk ${team.updated_through_week}`;
}

/** An NFL regular season is eighteen weeks, so "through 18" means final. */
const REGULAR_SEASON_WEEKS = 18;

/**
 * 1st, 2nd, 3rd, 4th — including the teens, which is the part naive
 * implementations get wrong: 11th, 12th and 13th, never 11st, 12nd, 13rd.
 */
export function ordinal(n: number): string {
  const teens = Math.abs(n) % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (Math.abs(n) % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const WINDOW_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/New_York",
});

/**
 * Which slot of the NFL week a kickoff belongs to, phrased as people say it:
 * "the 4:25", "Sunday night", "Thursday night".
 *
 * This is what turns a share from a score into a story — "busted in the 4:25"
 * is the line someone screenshots. Derived from Eastern time rather than a
 * stored label, because the league's schedule is defined in Eastern and the
 * lock time already tracks that same clock through the November DST shift.
 */
export function kickoffWindow(iso: string): string {
  const parts = WINDOW_FORMAT.formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  if (weekday === "Thu") return "Thursday night";
  if (weekday === "Fri") return "Friday";
  if (weekday === "Sat") return "Saturday";
  if (weekday === "Mon") return "Monday night";

  // Sunday splits four ways. The boundaries sit between the windows rather than
  // on them, so a 13:00 or a 16:05 or a 16:25 start all land where they should
  // even when a game is moved by half an hour.
  if (hour < 12) return "the London game";
  if (hour < 15) return "the 1pm";
  if (hour < 19) return "the 4:25";
  return "Sunday night";
}
