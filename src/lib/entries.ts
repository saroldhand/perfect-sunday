import { supabase } from "@/lib/supabase/client";
import { toEntryRows, type EntryRow, type RawEntry } from "@/lib/leaderboard";
import {
  toSeasonEntries,
  type RawSeasonEntry,
  type SeasonEntry,
} from "@/lib/season";

/**
 * Every entry for a week, with the player's name. Readable signed-out:
 * entries_select_public covers the rows, and migration 0012 grants anon the
 * display_name column the embed needs.
 */
export async function getEntries(weekId: number): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from("entries")
    .select(
      "user_id, correct_count, picks_possible, is_alive, is_complete, is_perfect, profiles(display_name)",
    )
    .eq("week_id", weekId);

  if (error) throw new Error(error.message);
  return toEntryRows((data ?? []) as unknown as RawEntry[]);
}

/**
 * Every entry from the season's scored weeks, for the season table. Same
 * public readability as getEntries; the inner join is what lets the filters
 * reach the week's season and status, and it is why a row can never come back
 * weekless. Scored weeks only — a locked week's totals are still moving, and
 * the season table shows finished arithmetic. seasonStandings does the rest.
 */
export async function getSeasonEntries(season: number): Promise<SeasonEntry[]> {
  const { data, error } = await supabase
    .from("entries")
    .select(
      "user_id, correct_count, picks_possible, is_perfect, weeks!inner(season, week_number, status), profiles(display_name)",
    )
    .eq("weeks.season", season)
    .eq("weeks.status", "scored");

  if (error) throw new Error(error.message);
  return toSeasonEntries((data ?? []) as unknown as RawSeasonEntry[]);
}
