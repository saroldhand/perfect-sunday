import { describe, expect, it } from "vitest";
import { clockTo, formatOdds, ordinal, priceFor, statsProvenance } from "./format";

const T0 = Date.parse("2026-09-10T20:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

describe("clockTo", () => {
  it("is expired at and after the lock", () => {
    expect(clockTo(at(0), T0)).toEqual({ expired: true, days: 0, clock: "00:00" });
    expect(clockTo(at(-1), T0).expired).toBe(true);
  });

  it("ticks MM:SS under an hour", () => {
    expect(clockTo(at(9 * 60_000 + 7_000), T0)).toEqual({
      expired: false,
      days: 0,
      clock: "09:07",
    });
  });

  it("ticks HH:MM:SS under a day", () => {
    expect(clockTo(at(3 * 3_600_000 + 5 * 60_000 + 1_000), T0)).toEqual({
      expired: false,
      days: 0,
      clock: "03:05:01",
    });
  });

  it("carries whole days separately so the clock never reads 26:00:00", () => {
    expect(clockTo(at(26 * 3_600_000), T0)).toEqual({
      expired: false,
      days: 1,
      clock: "02:00:00",
    });
  });
});

describe("statsProvenance", () => {
  it("names the season so last year's record is never read as this year's", () => {
    expect(statsProvenance({ stats_season: 2025, updated_through_week: 18 })).toBe(
      "2025 final",
    );
    expect(statsProvenance({ stats_season: 2026, updated_through_week: 3 })).toBe(
      "2026 thru wk 3",
    );
  });

  it("returns null when provenance is missing, so the card shows no numbers", () => {
    // The card gates its stat line on this. Unlabelled numbers are the failure
    // mode being prevented, so an unknown season must not degrade to a bare
    // record — it must suppress the line entirely.
    expect(statsProvenance({ stats_season: null, updated_through_week: 18 })).toBeNull();
    expect(statsProvenance({ stats_season: 2025, updated_through_week: null })).toBeNull();
  });
});

describe("ordinal", () => {
  it("suffixes the ordinary cases", () => {
    expect([1, 2, 3, 4, 9].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "9th"]);
  });

  it("gives the teens th, which is the case naive versions get wrong", () => {
    expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
    expect([21, 22, 23, 111, 112].map(ordinal)).toEqual([
      "21st",
      "22nd",
      "23rd",
      "111th",
      "112th",
    ]);
  });
});

describe("priceFor", () => {
  // NYG are home underdogs here, so the two columns differ in sign. A test
  // where both sides were favourites, or where the numbers were mirror images,
  // would pass just as happily with the columns crossed.
  const game = { moneyline_home: 155, moneyline_away: -180 };

  it("reads the column the side names, rather than negating one number", () => {
    // This is where the spread's lineFor and this differ. A spread was the
    // home team's line and the away side was its negation, so "away" meant
    // "flip the sign". Two independent prices have no such relationship:
    // -180 is not the negation of +155, and inventing one would misquote
    // every game.
    expect(priceFor(game, "home")).toBe("+155");
    expect(priceFor(game, "away")).toBe("-180");
  });

  it("keeps the plus on an underdog, because a bare 155 is not a price", () => {
    expect(priceFor(game, "home")).toBe("+155");
  });

  it("shows an absent price as a dash rather than a zero", () => {
    // A week cannot open without prices, so this is the brief window after a
    // slate is seeded and before sync-slate has run. "0" would read as even
    // money, which is a number nobody posted.
    const noLine = { moneyline_home: null, moneyline_away: null };
    expect(priceFor(noLine, "home")).toBe("—");
    expect(priceFor(noLine, "away")).toBe("—");
  });

  it("agrees with formatOdds, which is the one place a sign is printed", () => {
    expect(priceFor(game, "home")).toBe(formatOdds(game.moneyline_home));
    expect(priceFor(game, "away")).toBe(formatOdds(game.moneyline_away));
  });
});
