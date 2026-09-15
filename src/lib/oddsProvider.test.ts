import { describe, expect, it } from "vitest";
import {
  externalId,
  parseNflverseGames,
} from "../../supabase/functions/_shared/oddsProvider";

/**
 * The real file has 46 columns. These fixtures carry only the ones the parser
 * reads, in a deliberately different order, because the parser must key off
 * header names. Two pairs are reversed against the real feed to prove it:
 * there `away_moneyline` precedes `home_moneyline` and `under_odds` precedes
 * `over_odds`, and a positional reader would transpose both without changing
 * any row count.
 */
const HEADER =
  "game_id,season,game_type,week,gameday,away_team,home_team,home_moneyline,away_moneyline,under_odds,over_odds,total_line";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

// Real 2026 Week 2 rows. KC are home favourites (-305), NYJ are home dogs
// (+170), so the two cases are asymmetric in both fields at once — a swap of
// home for away cannot pass both.
const KC_HOME_FAVOURITE = "2026_02_IND_KC,2026,REG,2,2026-09-20,IND,KC,-305,245,-110,-110,47.5";
const NYJ_HOME_DOG = "2026_02_GB_NYJ,2026,REG,2,2026-09-20,GB,NYJ,170,-205,-115,-105,44.5";

describe("parseNflverseGames", () => {
  it("puts each team's price on its own side, and keeps the sign", () => {
    // The moneyline equivalent of the spread sign flip this replaced, and the
    // one thing here that can be wrong while looking entirely normal. A
    // moneyline needs no sign convention translated — each column is already
    // that team's own American price — so the only way to get it wrong is to
    // read the columns crossed, which grades the favourite as the underdog.
    //
    // Asserted on a home favourite and a home underdog, because a transposition
    // on a single game is indistinguishable from a correctly parsed mirror of
    // that game.
    const [kc] = parseNflverseGames(csv(KC_HOME_FAVOURITE), 2026, 2);
    expect(kc.moneylineHome).toBe(-305);
    expect(kc.moneylineAway).toBe(245);

    const [nyj] = parseNflverseGames(csv(NYJ_HOME_DOG), 2026, 2);
    expect(nyj.moneylineHome).toBe(170);
    expect(nyj.moneylineAway).toBe(-205);
  });

  it("keeps an underdog's price positive rather than dropping its sign", () => {
    // +245 and -245 are opposite bets. Coercing through anything that strips a
    // leading sign, or storing an absolute value, would show every underdog as
    // a favourite.
    const [kc] = parseNflverseGames(csv(KC_HOME_FAVOURITE), 2026, 2);
    expect(kc.moneylineAway).toBeGreaterThan(0);
    expect(kc.moneylineHome).toBeLessThan(0);
  });

  it("reads the over/under prices by column name, not position", () => {
    // under_odds precedes over_odds in the fixture, as it does in the feed.
    const [nyj] = parseNflverseGames(csv(NYJ_HOME_DOG), 2026, 2);
    expect(nyj.overOdds).toBe(-105);
    expect(nyj.underOdds).toBe(-115);
    expect(nyj.total).toBe(44.5);
  });

  it("builds an external_id that matches the seeded games rows", () => {
    const [kc] = parseNflverseGames(csv(KC_HOME_FAVOURITE), 2026, 2);
    expect(kc.externalId).toBe("2026-02-IND-KC");
  });

  it("maps the Rams from LA to LAR", () => {
    // teams.abbr uses LAR. An unmapped LA would fail the games foreign key —
    // loudly, which is the right failure — but it would fail every week.
    const row = "2026_02_NYG_LA,2026,REG,2,2026-09-20,NYG,LA,-355,280,-110,-110,48.5";
    const [game] = parseNflverseGames(csv(row), 2026, 2);
    expect(game.externalId).toBe("2026-02-NYG-LAR");
  });

  it("keeps the requested week and season only", () => {
    const other = "2026_03_NYJ_BUF,2026,REG,3,2026-09-27,NYJ,BUF,-400,310,-110,-110,40.5";
    const lastYear = "2025_02_IND_KC,2025,REG,2,2025-09-14,IND,KC,-305,245,-110,-110,47.5";
    const lines = parseNflverseGames(csv(KC_HOME_FAVOURITE, other, lastYear), 2026, 2);
    expect(lines.map((l) => l.externalId)).toEqual(["2026-02-IND-KC"]);
  });

  it("excludes playoff rows, which reuse low week numbers", () => {
    // A divisional game is week 2 of the postseason. Filtering on week alone
    // would pull it into the regular season's Week 2 slate.
    const playoff = "2026_20_MIA_BUF,2026,DIV,2,2027-01-23,MIA,BUF,-400,310,-110,-110,40.5";
    const lines = parseNflverseGames(csv(KC_HOME_FAVOURITE, playoff), 2026, 2);
    expect(lines.map((l) => l.externalId)).toEqual(["2026-02-IND-KC"]);
  });

  it("drops a game that is missing any of the five numbers", () => {
    // Half a line is not pickable. Leaving the row out keeps the columns NULL,
    // which is what stops apply_week_lines opening the week.
    //
    // The missing-moneyline cases are not hypothetical: 2017_04_CHI_GB carries
    // a spread and a total but no prices, and every pre-2015 season has none.
    const noHomeMl = "2026_02_NO_BAL,2026,REG,2,2026-09-20,NO,BAL,,320,-110,-110,46.5";
    const noAwayMl = "2026_02_CLE_TB,2026,REG,2,2026-09-20,CLE,TB,-410,,-110,-110,40.5";
    const naMl = "2026_02_MIA_SF,2026,REG,2,2026-09-20,MIA,SF,NA,NA,-110,-110,45.5";
    const noTotal = "2026_02_WAS_DAL,2026,REG,2,2026-09-20,WAS,DAL,-218,180,-110,-110,";
    const noOdds = "2026_02_LV_LAC,2026,REG,2,2026-09-20,LV,LAC,-310,250,,,43.5";
    const lines = parseNflverseGames(
      csv(KC_HOME_FAVOURITE, noHomeMl, noAwayMl, naMl, noTotal, noOdds),
      2026,
      2,
    );
    expect(lines.map((l) => l.externalId)).toEqual(["2026-02-IND-KC"]);
  });

  it("treats an even-money +100 as a real price, not a missing one", () => {
    // The pick-em case. A truthiness check anywhere in the chain would read
    // 100 fine but drop a 0, and while no book posts a 0 moneyline, the parser
    // promises that "" and "NA" are the only things that mean absent.
    const evens = "2026_02_CIN_HOU,2026,REG,2,2026-09-20,CIN,HOU,100,-120,-110,-110,46.5";
    const [game] = parseNflverseGames(csv(evens), 2026, 2);
    expect(game.moneylineHome).toBe(100);
  });

  it("survives quoted fields containing commas", () => {
    // The real feed quotes coach and stadium names. Splitting on "," loses
    // column alignment from that row on and silently reads wrong values.
    const header = `${HEADER},coach`;
    const row = `${KC_HOME_FAVOURITE},"Reid, Andy"`;
    const [game] = parseNflverseGames([header, row].join("\n"), 2026, 2);
    expect(game.moneylineHome).toBe(-305);
    expect(game.total).toBe(47.5);
  });

  it("returns nothing for an empty or headerless document", () => {
    expect(parseNflverseGames("", 2026, 2)).toEqual([]);
    expect(parseNflverseGames(HEADER, 2026, 2)).toEqual([]);
  });
});

describe("externalId", () => {
  it("zero-pads the week so a season sorts as text", () => {
    expect(externalId(2026, 1, "LV", "KC")).toBe("2026-01-LV-KC");
    expect(externalId(2026, 18, "LV", "KC")).toBe("2026-18-LV-KC");
  });
});
