import { describe, expect, it } from "vitest";
import { clockTo } from "./format";

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
