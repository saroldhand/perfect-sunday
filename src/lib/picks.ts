import { supabase } from "@/lib/supabase/client";
import type { RawHistoryPick } from "@/lib/history";

/** A total pick is a side of the number, not a team. */
export type TotalSide = "OVER" | "UNDER";

export type PickRow = {
  game_id: string;
  total_pick: string | null;
  moneyline_pick: string | null;
};

/** `moneyline` is the team backed to win outright — a club abbreviation. */
export type Pick = { total: TotalSide | null; moneyline: string | null };
export type PickMap = Record<string, Pick>;

export async function getPicks(userId: string, gameIds: string[]): Promise<PickMap> {
  if (gameIds.length === 0) return {};

  const { data, error } = await supabase
    .from("picks")
    .select("game_id, total_pick, moneyline_pick")
    .eq("user_id", userId)
    .in("game_id", gameIds);

  if (error) throw new Error(error.message);

  const map: PickMap = {};
  for (const row of (data ?? []) as PickRow[]) {
    map[row.game_id] = {
      total: (row.total_pick as TotalSide | null) ?? null,
      moneyline: row.moneyline_pick,
    };
  }
  return map;
}

// Writes for one game are chained so two fast taps cannot land out of order and
// leave the row showing the earlier choice.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Saves a pick, creating the row if this is the first choice for that game.
 *
 * Deliberately not a PostgREST upsert. Upsert emits
 * `ON CONFLICT DO UPDATE SET user_id = ..., game_id = ...` for every column in
 * the payload, and `authenticated` holds UPDATE on only total_pick and
 * moneyline_pick — that grant is what stops a user marking their own picks
 * correct. Update-then-insert works within it.
 */
export function savePick(
  userId: string,
  gameId: string,
  patch: { total_pick?: TotalSide; moneyline_pick?: string },
): Promise<void> {
  const run = (inFlight.get(gameId) ?? Promise.resolve()).then(async () => {
    const updated = await supabase
      .from("picks")
      .update(patch)
      .eq("user_id", userId)
      .eq("game_id", gameId)
      .select("id");

    if (updated.error) throw new Error(updated.error.message);
    if (updated.data && updated.data.length > 0) return;

    const inserted = await supabase
      .from("picks")
      .insert({ user_id: userId, game_id: gameId, ...patch });

    // 23505 means the row appeared between the update and the insert — another
    // tab, or a retry. The update path is correct now.
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw new Error(inserted.error.message);
      const retry = await supabase
        .from("picks")
        .update(patch)
        .eq("user_id", userId)
        .eq("game_id", gameId);
      if (retry.error) throw new Error(retry.error.message);
    }
  });

  inFlight.set(
    gameId,
    run.catch(() => {}),
  );
  return run;
}

/** A game counts as done only when both of its picks are in. */
export function isGameComplete(pick?: Pick) {
  return Boolean(pick?.total && pick?.moneyline);
}

export function countCompleted(picks: PickMap, gameIds: string[]) {
  return gameIds.filter((id) => isGameComplete(picks[id])).length;
}

/** A pick plus how it graded. Null grade means not graded yet — never wrong. */
export type Result = Pick & {
  totalCorrect: boolean | null;
  moneylineCorrect: boolean | null;
};

export type ResultMap = Record<string, Result>;

type ResultRow = PickRow & {
  total_correct: boolean | null;
  moneyline_correct: boolean | null;
};

/**
 * Own picks with their grades, for My Week and the hub.
 *
 * Reading the grading columns is allowed and always has been — RLS and the
 * column grant restrict who may *write* total_correct and moneyline_correct,
 * never who may read their own. getPicks stays grade-free on purpose: the
 * deck is the one screen that must never show them.
 */
export async function getResults(
  userId: string,
  gameIds: string[],
): Promise<ResultMap> {
  if (gameIds.length === 0) return {};

  const { data, error } = await supabase
    .from("picks")
    .select("game_id, total_pick, moneyline_pick, total_correct, moneyline_correct")
    .eq("user_id", userId)
    .in("game_id", gameIds);

  if (error) throw new Error(error.message);

  const map: ResultMap = {};
  for (const row of (data ?? []) as ResultRow[]) {
    map[row.game_id] = {
      total: (row.total_pick as TotalSide | null) ?? null,
      moneyline: row.moneyline_pick,
      totalCorrect: row.total_correct,
      moneylineCorrect: row.moneyline_correct,
    };
  }
  return map;
}

/**
 * Every pick the user has ever made, with its game and week attached, for the
 * Previous screen. Grouped into weeks by toHistoryWeeks, which is where the
 * "what counts as previous" rule lives and is tested.
 *
 * The inner joins are what let a row carry its week, and are why a returned
 * row can never be weekless — the same reason getSeasonEntries uses them.
 * Deliberately unfiltered by week: the clock test belongs in one place, and
 * that place is a pure function rather than a query string.
 */
export async function getHistoryPicks(userId: string): Promise<RawHistoryPick[]> {
  const games =
    "id, home_team, away_team, kickoff_at, moneyline_home, moneyline_away, total, over_odds, under_odds, home_score, away_score, status";
  const weeks = "id, season, week_number, locks_at, status";

  const { data, error } = await supabase
    .from("picks")
    .select(
      `game_id, total_pick, moneyline_pick, total_correct, moneyline_correct, games!inner(${games}, weeks!inner(${weeks}))`,
    )
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RawHistoryPick[];
}
