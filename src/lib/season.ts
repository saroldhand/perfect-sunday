/**
 * The season table: every scored week's entries summed per player.
 *
 * SPEC §4 sketches this as a `season_standings` materialized view refreshed by
 * the scoring job. At this product's scale that is the wrong tool: a season is
 * at most 18 entry rows per player, the rows are already publicly readable for
 * the weekly board, and summing a few hundred of them in the client costs
 * nothing — while a view would be one more migration, one more refresh step
 * the scoring job could forget, and one more thing the static frontend could
 * race ahead of. So the aggregation lives here, with the same no-database
 * testability as the weekly ranking, and the view can exist later if the
 * numbers ever say otherwise.
 *
 * Only scored weeks are counted. A locked week's totals are still moving, and
 * a season table that shuffles mid-Sunday reads as broken next to the weekly
 * board, which is the screen that carries the live drama.
 */

export type SeasonEntry = {
  user_id: string;
  display_name: string;
  week_number: number;
  correct_count: number;
  picks_possible: number;
  is_perfect: boolean;
};

export type SeasonRow = {
  user_id: string;
  display_name: string;
  /** Correct picks across every scored week they completed. */
  total_correct: number;
  total_possible: number;
  /** Scored weeks with a complete entry — entries only exist for complete
   *  sets, so every row counts. */
  weeks_played: number;
  best_week: number;
  perfect_weeks: number;
};

export type RankedSeasonRow = SeasonRow & { rank: number };

/**
 * SPEC §4's sort order: total correct, then weeks played as the tiebreak.
 * Incomplete weeks never produce an entry row, so weeks played is a clean
 * measure of showing up, and the tiebreak rewards consistency over one hot
 * week. Display name last, only so the order is reproducible between loads.
 *
 * Ranking is standard competition ranking (1, 2, 2, 4), shared only when both
 * ranked numbers agree — two players on 40 correct are *not* tied if one
 * played three weeks and the other two, because the sort order says the
 * three-week player finishes ahead.
 */
export function seasonStandings(entries: SeasonEntry[]): RankedSeasonRow[] {
  const byUser = new Map<string, SeasonRow>();

  for (const entry of entries) {
    const row = byUser.get(entry.user_id) ?? {
      user_id: entry.user_id,
      display_name: entry.display_name,
      total_correct: 0,
      total_possible: 0,
      weeks_played: 0,
      best_week: 0,
      perfect_weeks: 0,
    };
    row.total_correct += entry.correct_count;
    row.total_possible += entry.picks_possible;
    row.weeks_played += 1;
    row.best_week = Math.max(row.best_week, entry.correct_count);
    if (entry.is_perfect) row.perfect_weeks += 1;
    byUser.set(entry.user_id, row);
  }

  const sorted = [...byUser.values()].sort((a, b) => {
    if (b.total_correct !== a.total_correct) return b.total_correct - a.total_correct;
    if (b.weeks_played !== a.weeks_played) return b.weeks_played - a.weeks_played;
    return a.display_name.localeCompare(b.display_name, "en");
  });

  let rank = 0;
  let previous: { correct: number; weeks: number } | null = null;

  return sorted.map((row, index) => {
    if (
      previous === null ||
      row.total_correct !== previous.correct ||
      row.weeks_played !== previous.weeks
    ) {
      rank = index + 1;
      previous = { correct: row.total_correct, weeks: row.weeks_played };
    }
    return { ...row, rank };
  });
}

/** How far the table reaches, for the header: the latest scored week summed
 *  into it. Zero on an empty season. */
export function throughWeek(entries: SeasonEntry[]): number {
  return entries.reduce((latest, e) => Math.max(latest, e.week_number), 0);
}

/** Shape PostgREST returns: many-to-one embeds are objects, not arrays. */
export type RawSeasonEntry = {
  user_id: string;
  correct_count: number;
  picks_possible: number;
  is_perfect: boolean;
  weeks: { week_number: number } | null;
  profiles: { display_name: string } | null;
};

/**
 * The pure half of the season read, mirroring toEntryRows: flatten the embeds,
 * and let a missing profile degrade to a placeholder rather than blanking a
 * line of the table. A row whose week embed is missing is dropped outright —
 * without a week number it cannot be attributed, and the inner join in the
 * query means it should not happen at all.
 */
export function toSeasonEntries(raw: RawSeasonEntry[]): SeasonEntry[] {
  return raw
    .filter((row) => row.weeks !== null)
    .map((row) => ({
      user_id: row.user_id,
      display_name: row.profiles?.display_name ?? "Unknown player",
      week_number: row.weeks!.week_number,
      correct_count: row.correct_count,
      picks_possible: row.picks_possible,
      is_perfect: row.is_perfect,
    }));
}
