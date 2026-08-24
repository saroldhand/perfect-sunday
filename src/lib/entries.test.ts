import { describe, it, expect } from "vitest";
import { toEntryRows } from "@/lib/entries";

describe("toEntryRows", () => {
  it("flattens the embedded profile into display_name", () => {
    const rows = toEntryRows([
      {
        user_id: "u1",
        correct_count: 21,
        picks_possible: 32,
        is_alive: false,
        is_complete: true,
        is_perfect: false,
        profiles: { display_name: "Harry S" },
      },
    ]);
    expect(rows[0].display_name).toBe("Harry S");
    expect(rows[0].correct_count).toBe(21);
  });

  it("falls back to a placeholder when the profile embed is null", () => {
    const rows = toEntryRows([
      {
        user_id: "u1",
        correct_count: 0,
        picks_possible: 32,
        is_alive: true,
        is_complete: true,
        is_perfect: false,
        profiles: null,
      },
    ]);
    expect(rows[0].display_name).toBe("Unknown player");
  });

  it("returns an empty array for no entries", () => {
    expect(toEntryRows([])).toEqual([]);
  });
});
