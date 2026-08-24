import type { Week } from "@/lib/week";

/**
 * Which week the app should be showing.
 *
 * This used to be "the open week, else the highest season and week number",
 * which was correct only while the database held a single week. With the whole
 * 2026 season seeded ahead of time it is actively wrong: in September the
 * highest week number is Week 18, so the app would point at January.
 *
 * Order of preference:
 *
 *   1. A week in play — `open` or `locked`. This is the answer for most of the
 *      season, and `locked` has to be here too: between Thursday's lock and the
 *      last game going final, the week the user cares about is the one they are
 *      already in.
 *   2. The next week that has not locked yet, earliest first. This covers the
 *      gap between one week being scored and the next opening, which is where
 *      the app sits every Monday and Tuesday.
 *   3. Whatever happened most recently. Only reached once the season is over
 *      and there is nothing ahead, so the app shows the final week rather than
 *      an empty screen.
 *
 * Ordered by `locks_at` throughout rather than by week number, because that is
 * the field the schedule actually moves — a flexed game changes when a week
 * belongs, and a week number never tells you whether it has happened.
 */
export function selectCurrentWeek(weeks: Week[], now: number): Week | null {
  if (weeks.length === 0) return null;

  const byLock = [...weeks].sort(
    (a, b) => Date.parse(a.locks_at) - Date.parse(b.locks_at),
  );

  // Latest, not earliest: if a previous week were somehow left `locked` because
  // its last game never went final, the week in play is still the newer one.
  const inPlay = byLock.filter(
    (w) => w.status === "open" || w.status === "locked",
  );
  if (inPlay.length > 0) return inPlay[inPlay.length - 1];

  const ahead = byLock.find(
    (w) => w.status === "upcoming" && Date.parse(w.locks_at) > now,
  );
  if (ahead) return ahead;

  return byLock[byLock.length - 1];
}
