import { describe, expect, it } from "vitest";
import {
  externalId,
  parseNflverseGames,
} from "../../supabase/functions/_shared/oddsProvider";

/**
 * The real file has 46 columns. These fixtures carry only the ones the parser
 * reads, in a deliberately different order, because the parser must key off
 * header names — in the real feed `under_odds` sits before `over_odds`, and a
 * positional reader would swap them without changing any row count.
 */
const HEADER =
  "game_id,season,game_type,week,gameday,away_team,home_team,under_odds,over_odds,spread_line,total_line";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

// nflverse writes spread_line positive when the HOME team is favoured.
const KC_FAVOURED = "2026_01_LV_KC,2026,REG,1,2026-09-13,LV,KC,-110,-110,3.5,44.5";
const HOME_DOG = "2026_01_CHI_GB,2026,REG,1,2026-09-13,CHI,GB,-115,-105,-2.5,41.0";

describe("parseNflverseGames", () => {
  it("flips the spread sign into this product's convention", () => {
    // The single most consequential line in the module. nflverse documents
    // spread_line as "a positive number means the home team was favored";
    // games.spread is the opposite. Verified against 544 completed 2024-25
    // games — home teams won 68.7% of those with a positive spread_line, which
    // is the favourite win rate, not a coin flip.
    //
    // Without the flip every spread pick grades backwards, and nothing about
    // the output looks wrong.
    const [kc] = parseNflverseGames(csv(KC_FAVOURED), 2026, 1);
    expect(kc.spread).toBe(-3.5);

    const [gb] = parseNflverseGames(csv(HOME_DOG), 2026, 1);
    expect(gb.spread).toBe(2.5);
  });

  it("reads odds by column name, not position", () => {
    // under_odds precedes over_odds in the fixture, as it does in the feed.
    const [gb] = parseNflverseGames(csv(HOME_DOG), 2026, 1);
    expect(gb.overOdds).toBe(-105);
    expect(gb.underOdds).toBe(-115);
  });

  it("builds an external_id that matches the seeded games rows", () => {
    const [kc] = parseNflverseGames(csv(KC_FAVOURED), 2026, 1);
    expect(kc.externalId).toBe("2026-01-LV-KC");
  });

  it("maps the Rams from LA to LAR", () => {
    // teams.abbr uses LAR. An unmapped LA would fail the games foreign key —
    // loudly, which is the right failure — but it would fail every week.
    const row = "2026_01_SF_LA,2026,REG,1,2026-09-10,SF,LA,-112,-108,3.5,48.5";
    const [game] = parseNflverseGames(csv(row), 2026, 1);
    expect(game.externalId).toBe("2026-01-SF-LAR");
  });

  it("keeps the requested week and season only", () => {
    const other = "2026_02_NYJ_BUF,2026,REG,2,2026-09-20,NYJ,BUF,-110,-110,6.5,40.5";
    const lastYear = "2025_01_LV_KC,2025,REG,1,2025-09-07,LV,KC,-110,-110,3.5,44.5";
    const lines = parseNflverseGames(csv(KC_FAVOURED, other, lastYear), 2026, 1);
    expect(lines.map((l) => l.externalId)).toEqual(["2026-01-LV-KC"]);
  });

  it("excludes playoff rows, which reuse low week numbers", () => {
    // A wild-card game is week 1 of the postseason. Filtering on week alone
    // would pull it into the regular season's Week 1 slate.
    const playoff = "2026_19_MIA_BUF,2026,WC,1,2027-01-16,MIA,BUF,-110,-110,6.5,40.5";
    const lines = parseNflverseGames(csv(KC_FAVOURED, playoff), 2026, 1);
    expect(lines.map((l) => l.externalId)).toEqual(["2026-01-LV-KC"]);
  });

  it("drops a game that is missing any of the four numbers", () => {
    // Half a line is not pickable. Leaving the row out keeps the column NULL,
    // which is what stops apply_week_lines opening the week.
    const noTotal = "2026_01_NE_SEA,2026,REG,1,2026-09-09,NE,SEA,-110,-110,3.5,";
    const naTotal = "2026_01_ATL_PIT,2026,REG,1,2026-09-13,ATL,PIT,-110,-110,3.5,NA";
    const noSpread = "2026_01_DAL_PHI,2026,REG,1,2026-09-13,DAL,PHI,-110,-110,,44.5";
    const lines = parseNflverseGames(
      csv(KC_FAVOURED, noTotal, naTotal, noSpread),
      2026,
      1,
    );
    expect(lines.map((l) => l.externalId)).toEqual(["2026-01-LV-KC"]);
  });

  it("treats a pick-em line of 0 as a real number, not a missing one", () => {
    const pickem = "2026_01_LV_KC,2026,REG,1,2026-09-13,LV,KC,-110,-110,0,44.5";
    const [game] = parseNflverseGames(csv(pickem), 2026, 1);
    expect(game.spread).toBe(-0);
    expect(game.spread === 0).toBe(true);
  });

  it("survives quoted fields containing commas", () => {
    // The real feed quotes coach and stadium names. Splitting on "," loses
    // column alignment from that row on and silently reads wrong values.
    const header = `${HEADER},coach`;
    const row = `${KC_FAVOURED},"Reid, Andy"`;
    const [game] = parseNflverseGames([header, row].join("\n"), 2026, 1);
    expect(game.spread).toBe(-3.5);
    expect(game.total).toBe(44.5);
  });

  it("returns nothing for an empty or headerless document", () => {
    expect(parseNflverseGames("", 2026, 1)).toEqual([]);
    expect(parseNflverseGames(HEADER, 2026, 1)).toEqual([]);
  });
});

describe("externalId", () => {
  it("zero-pads the week so a season sorts as text", () => {
    expect(externalId(2026, 1, "LV", "KC")).toBe("2026-01-LV-KC");
    expect(externalId(2026, 18, "LV", "KC")).toBe("2026-18-LV-KC");
  });
});
