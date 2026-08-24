import { supabase } from "@/lib/supabase/client";
import { toEntryRows, type EntryRow, type RawEntry } from "@/lib/leaderboard";

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
