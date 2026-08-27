import type { Game, Week } from "@/lib/week";

/**
 * How often the app should re-pull the week while it is on screen, in
 * milliseconds — or null when nothing it is looking at can change.
 *
 * The site is static and the database moves on its own schedule (lines land,
 * the lock job fires, scores arrive), so without this the app is a snapshot
 * of whenever the tab was opened. The cadence follows what is actually in
 * motion:
 *
 * - Games under way — kicked off and not yet final — is the product's whole
 *   reason to exist, so it polls fastest. This is what makes a pick flip
 *   green while the user watches.
 * - A week that is upcoming, open, or locked-but-idle is waiting on a state
 *   change measured in hours (lines posting, the lock, the first kickoff, the
 *   scoring job), so a slow tick is enough to catch it without a reload.
 * - A scored week is finished. Nothing about it changes until Tuesday, and
 *   the return visit that discovers the new week re-fetches on its own.
 *
 * Pure and clock-taking so the boundaries — kickoff crossed, last game gone
 * final — are testable. The slow tick also keeps the decision fresh: each
 * refresh re-evaluates this with a newer `now`, which is how the cadence
 * speeds up on its own when kickoff arrives.
 */
export const LIVE_POLL_MS = 60_000;
export const IDLE_POLL_MS = 300_000;

export function pollDelay(week: Week | null, games: Game[], now: number): number | null {
  if (!week) return null;

  if (week.status === "upcoming" || week.status === "open") return IDLE_POLL_MS;

  if (week.status === "locked") {
    const unresolved = games.some((g) => g.status !== "final");
    const started = games.some((g) => Date.parse(g.kickoff_at) <= now);
    // All final but still `locked` means the scoring job has not swept yet;
    // idle covers that flip. Before the first kickoff there is nothing live.
    return unresolved && started ? LIVE_POLL_MS : IDLE_POLL_MS;
  }

  return null;
}
