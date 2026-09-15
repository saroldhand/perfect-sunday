/**
 * The one place lines enter this product.
 *
 * SPEC §3 asks for a single module behind which the odds source can be swapped
 * without touching anything else. This is it. It lives beside the Edge Function
 * rather than in `src/lib` because nothing in the browser ever fetches odds —
 * the app reads `games` rows that this has already written.
 *
 * Swapping source means writing one more `OddsProvider` and changing which one
 * `sync-slate` constructs. Nothing else moves.
 */

/** One game's numbers, in this product's conventions rather than a feed's. */
export type LineRow = {
  /** Matches `games.external_id`, e.g. "2026-01-NE-SEA". */
  externalId: string;
  /**
   * American odds on each team winning outright, e.g. -218 and +180. Both
   * sides are carried rather than just the favourite's price, because the deck
   * shows each side its own number and the pair only means anything together.
   *
   * Unlike the spread this replaced, there is no sign convention to translate:
   * a moneyline is each team's own price, not one number applied to the home
   * team, so a feed cannot disagree with us about which way it points. The
   * sign is part of the value — negative is the favourite — and is passed
   * through untouched.
   */
  moneylineHome: number;
  moneylineAway: number;
  total: number;
  overOdds: number;
  underOdds: number;
};

export type OddsProvider = {
  /**
   * Written to `games.line_source` verbatim, so it must name where the numbers
   * actually came from. An entry graded against a line the user never saw is
   * the worst failure this product has, and a comfortable-sounding but wrong
   * provenance label is how that happens quietly.
   */
  readonly lineSource: string;
  fetchLines(season: number, week: number): Promise<LineRow[]>;
};

/**
 * nflverse abbreviates the Rams LA; `teams.abbr` uses LAR. Every other
 * abbreviation matches, and an unmapped one would fail the games foreign key
 * rather than silently mislabel a team.
 */
const ABBR: Record<string, string> = { LA: "LAR" };

const SOURCE_URL =
  "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

/**
 * nflverse's published schedule and market lines.
 *
 * The lines are a consensus market number, **not a named sportsbook**.
 * nflverse does not attribute them to one, so neither does `lineSource`.
 * Calling these FanDuel because FanDuel is what SPEC hoped for would be
 * exactly the quiet mislabelling the type comment above warns about.
 */
export const nflverseProvider: OddsProvider = {
  lineSource: "nflverse-consensus",

  async fetchLines(season, week) {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      throw new Error(`nflverse fetch failed: ${response.status} ${response.statusText}`);
    }
    return parseNflverseGames(await response.text(), season, week);
  },
};

/**
 * The half of the provider that can be wrong in a way nobody notices, kept
 * pure so it can be tested without a network.
 *
 * Rows without a complete set of five numbers are dropped rather than
 * part-filled. A game with a moneyline and no total is not a game anyone can
 * pick, and leaving it NULL is what keeps the week from opening — which is the
 * behaviour SPEC §5 wants.
 *
 * Moneyline coverage in this feed effectively matches the spread coverage it
 * replaces, but only back to 2015, and not perfectly. Measured on the file:
 *
 *   - 2015-2025 REG: 2,894 of 2,895 games carry both prices. The one exception,
 *     2017_04_CHI_GB, has a spread and a total but no moneyline.
 *   - 2026 REG: every game that carries a spread carries both moneylines.
 *   - before 2015: no moneylines at all, so 1,902 older games have a spread and
 *     no price. Irrelevant to a product syncing the current season, and stated
 *     so nobody backfills an old season from here and wonders why it stays shut.
 *
 * That single 2017 gap is the case this drop rule exists for: the row is
 * skipped, the game keeps NULL prices, the week does not open, and
 * apply_week_lines reports it as missing. A week held shut is visible and
 * fixable; a week opened on a price nobody posted is neither.
 */
export function parseNflverseGames(
  csv: string,
  season: number,
  week: number,
): LineRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];

  const header = rows[0];
  const at = (row: string[], column: string) => {
    const index = header.indexOf(column);
    return index === -1 ? "" : (row[index] ?? "");
  };

  const lines: LineRow[] = [];

  for (const row of rows.slice(1)) {
    if (at(row, "season") !== String(season)) continue;
    if (at(row, "week") !== String(week)) continue;
    // Playoff rows repeat week numbers 1-4, so filtering on week alone would
    // pull a wild-card game into the regular season's Week 1.
    if (at(row, "game_type") !== "REG") continue;

    const moneylineHome = num(at(row, "home_moneyline"));
    const moneylineAway = num(at(row, "away_moneyline"));
    const total = num(at(row, "total_line"));
    const overOdds = num(at(row, "over_odds"));
    const underOdds = num(at(row, "under_odds"));
    if (
      moneylineHome === null ||
      moneylineAway === null ||
      total === null ||
      overOdds === null ||
      underOdds === null
    ) {
      continue;
    }

    const away = ABBR[at(row, "away_team")] ?? at(row, "away_team");
    const home = ABBR[at(row, "home_team")] ?? at(row, "home_team");
    if (!away || !home) continue;

    lines.push({
      externalId: externalId(season, week, away, home),
      // NO SIGN FLIP, and that is the point. The spread this replaced needed
      // one: nflverse documents spread_line as "a positive number means the
      // home team was favored" while `games.spread` meant the opposite, so a
      // missing negation graded every spread pick backwards while looking
      // entirely normal. A moneyline carries no such convention — each column
      // is that team's own American price, negative when it is favoured, in
      // the same form the card prints. Read the two columns, keep the signs.
      //
      // Cross-checked on the 2026 Week 2 slate: the cheaper moneyline names
      // the same favourite as the spread on all 16 games, so the columns are
      // not transposed.
      moneylineHome,
      moneylineAway,
      total,
      overOdds,
      underOdds,
    });
  }

  return lines;
}

/** `games.external_id`, zero-padded so a week sorts as text. */
export function externalId(
  season: number,
  week: number,
  away: string,
  home: string,
): string {
  return `${season}-${String(week).padStart(2, "0")}-${away}-${home}`;
}

/** "" and nflverse's "NA" both mean no number, and neither is zero. */
function num(value: string): number | null {
  if (value === "" || value === "NA") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Minimal RFC 4180 reader. The file carries quoted fields — coach and stadium
 * names contain commas — so splitting on "," loses column alignment partway
 * down and silently reads the wrong values from that row on.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
