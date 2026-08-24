import { describe, expect, it } from "vitest";
import { selectCurrentWeek } from "@/lib/schedule";
import type { Week } from "@/lib/week";

/** A 2026 week, locking on the Thursday of the given ISO date. */
function week(n: number, locksAt: string, status: Week["status"]): Week {
  return { id: n, season: 2026, week_number: n, locks_at: locksAt, status };
}

const SEP = "2026-09-09T23:50:00Z"; // wk 1  — Wed opener, early lock
const SEP17 = "2026-09-17T20:00:00Z"; // wk 2
const SEP24 = "2026-09-24T20:00:00Z"; // wk 3
const JAN = "2027-01-10T17:30:00Z"; // wk 18 — Sunday opener, early lock

const SEPT_1ST = Date.parse("2026-09-01T12:00:00Z");
const OCT = Date.parse("2026-10-01T12:00:00Z");

describe("selectCurrentWeek", () => {
  it("returns null on an empty database", () => {
    expect(selectCurrentWeek([], SEPT_1ST)).toBeNull();
  });

  it("does not pick the highest week number just because it is highest", () => {
    // The regression this function exists for. With the whole season seeded as
    // `upcoming`, ordering by week number puts Week 18 — January — in front of
    // a user in September.
    const season = [
      week(1, SEP, "upcoming"),
      week(2, SEP17, "upcoming"),
      week(18, JAN, "upcoming"),
    ];
    expect(selectCurrentWeek(season, SEPT_1ST)?.week_number).toBe(1);
  });

  it("prefers a week in play over the next one up", () => {
    const season = [
      week(1, SEP, "open"),
      week(2, SEP17, "upcoming"),
      week(18, JAN, "upcoming"),
    ];
    expect(selectCurrentWeek(season, SEPT_1ST)?.week_number).toBe(1);
  });

  it("stays on a locked week rather than jumping to the next one", () => {
    // Between Thursday's lock and the last game going final, the week the user
    // cares about is the one they are already in.
    const season = [
      week(1, SEP, "locked"),
      week(2, SEP17, "upcoming"),
    ];
    expect(selectCurrentWeek(season, Date.parse("2026-09-13T18:00:00Z"))?.week_number).toBe(1);
  });

  it("moves on once the week is scored", () => {
    const season = [
      week(1, SEP, "scored"),
      week(2, SEP17, "upcoming"),
      week(3, SEP24, "upcoming"),
    ];
    expect(selectCurrentWeek(season, Date.parse("2026-09-15T12:00:00Z"))?.week_number).toBe(2);
  });

  it("skips an upcoming week whose lock time has already passed", () => {
    // Lines never arrived, so the week never opened and its lock slipped by.
    // Showing it would offer a countdown that has already run out.
    const season = [
      week(1, SEP, "upcoming"),
      week(2, SEP17, "upcoming"),
    ];
    expect(selectCurrentWeek(season, Date.parse("2026-09-11T12:00:00Z"))?.week_number).toBe(2);
  });

  it("falls back to the most recent week once the season is over", () => {
    const season = [
      week(1, SEP, "scored"),
      week(18, JAN, "scored"),
    ];
    expect(selectCurrentWeek(season, Date.parse("2027-02-01T12:00:00Z"))?.week_number).toBe(18);
  });

  it("takes the newer of two weeks left in play", () => {
    // A week whose last game never went final would otherwise strand the app on
    // it for the rest of the season.
    const season = [
      week(1, SEP, "locked"),
      week(4, "2026-10-01T20:00:00Z", "open"),
    ];
    expect(selectCurrentWeek(season, OCT)?.week_number).toBe(4);
  });

  it("orders by lock time, not by week number", () => {
    // Rows arrive in whatever order PostgREST returns them.
    const shuffled = [
      week(18, JAN, "upcoming"),
      week(2, SEP17, "upcoming"),
      week(1, SEP, "upcoming"),
    ];
    expect(selectCurrentWeek(shuffled, SEPT_1ST)?.week_number).toBe(1);
  });
});
