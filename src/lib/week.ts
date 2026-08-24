import { supabase } from "@/lib/supabase/client";

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
};

/**
 * The week the user should be looking at: the open one if there is one, else
 * the most recent by season and number. Returns null on an empty database.
 */
export async function getCurrentWeek(): Promise<Week | null> {
  const open = await supabase
    .from("weeks")
    .select("id, season, week_number, locks_at, status")
    .eq("status", "open")
    .order("season", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open.error) throw new Error(open.error.message);
  if (open.data) return open.data as Week;

  const latest = await supabase
    .from("weeks")
    .select("id, season, week_number, locks_at, status")
    .order("season", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) throw new Error(latest.error.message);
  return (latest.data as Week) ?? null;
}

/** Games in kickoff order. That ordering is load-bearing: it is what makes two
 *  people comparing share grids look at the same game in the same position. */
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

export async function getTeams(): Promise<Record<string, Team>> {
  const { data, error } = await supabase
    .from("teams")
    .select("abbr, name, primary_color, wins, losses, ties, ppg, papg, updated_through_week");

  if (error) throw new Error(error.message);
  return Object.fromEntries(((data ?? []) as Team[]).map((t) => [t.abbr, t]));
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
