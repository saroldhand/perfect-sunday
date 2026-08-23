import { supabase } from "@/lib/supabase/client";

/** A total pick is a side of the number, not a team. */
export type TotalSide = "OVER" | "UNDER";

export type PickRow = {
  game_id: string;
  total_pick: string | null;
  spread_pick: string | null;
};

export type Pick = { total: TotalSide | null; spread: string | null };
export type PickMap = Record<string, Pick>;

export async function getPicks(userId: string, gameIds: string[]): Promise<PickMap> {
  if (gameIds.length === 0) return {};

  const { data, error } = await supabase
    .from("picks")
    .select("game_id, total_pick, spread_pick")
    .eq("user_id", userId)
    .in("game_id", gameIds);

  if (error) throw new Error(error.message);

  const map: PickMap = {};
  for (const row of (data ?? []) as PickRow[]) {
    map[row.game_id] = {
      total: (row.total_pick as TotalSide | null) ?? null,
      spread: row.spread_pick,
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
 * spread_pick — that grant is what stops a user marking their own picks
 * correct. Update-then-insert works within it.
 */
export function savePick(
  userId: string,
  gameId: string,
  patch: { total_pick?: TotalSide; spread_pick?: string },
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
  return Boolean(pick?.total && pick?.spread);
}

export function countCompleted(picks: PickMap, gameIds: string[]) {
  return gameIds.filter((id) => isGameComplete(picks[id])).length;
}
