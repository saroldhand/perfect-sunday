/**
 * One row of the weekly board. Defined here rather than in the Supabase
 * module so the ranking logic — the part that can be wrong in a way nobody
 * notices — is testable without a database.
 */
export type EntryRow = {
  user_id: string;
  display_name: string;
  correct_count: number;
  picks_possible: number;
  is_alive: boolean;
  is_complete: boolean;
  is_perfect: boolean;
};

export type RankedEntry = EntryRow & { rank: number };

/**
 * Standard competition ranking: tied entries share a rank and the next rank
 * skips — 1, 2, 2, 4. Two people on twelve correct are tied, and showing one
 * of them as third is simply wrong.
 *
 * Ties break on display name so the board is reproducible between loads.
 * Without it Postgres returns whatever order it likes and the list reshuffles
 * under the reader.
 */
export function rankEntries(rows: EntryRow[]): RankedEntry[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count;
    return a.display_name.localeCompare(b.display_name, "en");
  });

  let rank = 0;
  let previous: number | null = null;

  return sorted.map((row, index) => {
    if (previous === null || row.correct_count !== previous) {
      rank = index + 1;
      previous = row.correct_count;
    }
    return { ...row, rank };
  });
}
