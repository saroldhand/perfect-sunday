import { supabase } from "@/lib/supabase/client";
import { selectCurrentWeek } from "@/lib/schedule";

export type WeekStatus = "upcoming" | "open" | "locked" | "scored";

export type Week = {
  id: number;
  season: number;
  week_number: number;
  locks_at: string;
  status: WeekStatus;
};

export type GameStatus = "scheduled" | "in_progress" | "final";

export type Game = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  spread: number | null;
  total: number | null;
  over_odds: number | null;
  under_odds: number | null;
  home_score: number | null;
  away_score: number | null;
  status: GameStatus;
};

export type Team = {
  abbr: string;
  name: string;
  primary_color: string;
  wins: number;
  losses: number;
  ties: number;
  ppg: number | null;
  papg: number | null;
  // Null means the stats have never been filled in. The card hides the stat
  // line entirely in that case rather than printing a confident 0-0-0.
  updated_through_week: number | null;
  // Which season the four numbers above describe. Carried so the card can say
  // so out loud: in Week 1 these are last season's finals, and a record shown
  // without its season reads as current form.
  stats_season: number | null;
};

/**
 * The week the user should be looking at: the open one if there is one, else
 * the most recent by season and number. Returns null on an empty database.
 */
export async function getCurrentWeek(): Promise<Week | null> {
  // Every week, not a filtered top-1. There are nineteen rows and the choice
  // between them depends on status and clock together, which is easier to get
  // right — and to test — in one pure function than in a chain of queries.
  const { data, error } = await supabase
    .from("weeks")
    .select("id, season, week_number, locks_at, status")
    .order("locks_at", { ascending: true });

  if (error) throw new Error(error.message);
  return selectCurrentWeek((data ?? []) as Week[], Date.now());
}

export async function getGames(weekId: number): Promise<Game[]> {
  const { data, error } = await supabase
    .from("games")
    .select(
      "id, home_team, away_team, kickoff_at, spread, total, over_odds, under_odds, home_score, away_score, status",
    )
    .eq("week_id", weekId)
    .order("kickoff_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Game[];
}

/** Everything a card needs to name a club. Without these there is no UI. */
const TEAM_CORE = "abbr, name, primary_color";

/**
 * The stat line. Decorative — the card hides it when it is absent — and the
 * newest of them, stats_season, arrives in migration 0013.
 */
const TEAM_STATS = "wins, losses, ties, ppg, papg, updated_through_week, stats_season";

/** PostgREST surfaces Postgres SQLSTATE 42703, undefined_column, verbatim. */
const UNDEFINED_COLUMN = "42703";

/**
 * Teams, with the stat columns treated as optional.
 *
 * The frontend deploys from CI on every push to main; migrations are applied
 * by hand. So there is always a window where the built app asks for a column
 * the database does not have yet, and this query is the one that hit it —
 * selecting stats_season before 0013 was applied failed the whole read, and
 * because WeekProvider wraps every tabbed screen, one decorative column took
 * down the entire app with "Something went wrong".
 *
 * A missing stat line is not a reason to lose the product. The full select is
 * tried first and is what runs once the migration lands; an undefined column
 * falls back to the core fields and leaves the stats blank, which the card
 * already knows how to render. Any other error is real and still throws.
 */
export async function getTeams(): Promise<Record<string, Team>> {
  const full = await supabase.from("teams").select(`${TEAM_CORE}, ${TEAM_STATS}`);
  if (!full.error) return byAbbr(full.data ?? []);
  if (full.error.code !== UNDEFINED_COLUMN) throw new Error(full.error.message);

  const core = await supabase.from("teams").select(TEAM_CORE);
  if (core.error) throw new Error(core.error.message);
  return byAbbr(core.data ?? []);
}

/**
 * Fills in whatever the fallback select did not return. The zeroes are never
 * shown: the card keys the stat line off provenance, which stays null here.
 */
function byAbbr(rows: Record<string, unknown>[]): Record<string, Team> {
  return Object.fromEntries(
    rows.map((row) => {
      const team: Team = {
        wins: 0,
        losses: 0,
        ties: 0,
        ppg: null,
        papg: null,
        updated_through_week: null,
        stats_season: null,
        ...(row as Partial<Team>),
      } as Team;
      return [team.abbr, team];
    }),
  );
}

/**
 * The most recent finished week. The board shows this before the current
 * week locks, because entries do not exist until lock_week runs and there is
 * nothing to rank until then.
 */
export async function getLastScoredWeek(): Promise<Week | null> {
  const { data, error } = await supabase
    .from("weeks")
    .select("id, season, week_number, locks_at, status")
    .eq("status", "scored")
    .order("season", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Week) ?? null;
}
