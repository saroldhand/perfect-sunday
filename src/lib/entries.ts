import { supabase } from "@/lib/supabase/client";
import type { EntryRow } from "@/lib/leaderboard";

/** Shape PostgREST returns for the embed. A many-to-one embed is an object,
 *  not an array. */
export type RawEntry = {
  user_id: string;
  correct_count: number;
  picks_possible: number;
  is_alive: boolean;
  is_complete: boolean;
  is_perfect: boolean;
  profiles: { display_name: string } | null;
};

export function toEntryRows(raw: RawEntry[]): EntryRow[] {
  return raw.map((row) => ({
    user_id: row.user_id,
    // A null embed means the profile row was deleted but the cascade has not
    // run, or a future policy hid it. Neither should blank out a whole line of
    // the board.
    display_name: row.profiles?.display_name ?? "Unknown player",
    correct_count: row.correct_count,
    picks_possible: row.picks_possible,
    is_alive: row.is_alive,
    is_complete: row.is_complete,
    is_perfect: row.is_perfect,
  }));
}

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
