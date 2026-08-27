// sync-scores — the results twin of sync-slate: the only part of scoring that
// makes an outbound call, so the only part that is an Edge Function. It is
// what turns "cards update post-game" from an operator typing box scores into
// something that happens on its own, any day a game finishes.
//
// Deliberately thin, same as sync-slate. Everything that can be wrong in a way
// nobody notices lives somewhere testable:
//
//   - reading the feed: status mapping, home/away orientation, WSH→WAS
//       -> _shared/scoresProvider.ts, covered by src/lib/scoresProvider.test.ts
//   - refusing an unlocked week, never rewriting a final, grading in-call
//       -> private.apply_week_scores, covered by supabase/tests/scores.sql
//
// What is left here is fetch, hand over, report.
//
// Deploy:  supabase functions deploy sync-scores
// Schedule: see OPERATIONS.md. Nothing schedules it by default.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { espnProvider } from "../_shared/scoresProvider.ts";

// Injected by the Edge Function runtime. The service-role key is what reaches
// public.sync_apply_week_scores, granted to that role and no other — see 0017.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const provider = espnProvider;

Deno.serve(async (request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // A specific week can be named for a re-run; otherwise the database picks
    // the earliest locked week with a started slate and an unfinished game.
    let weekId: number | null = null;
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.weekId === "number") weekId = body.weekId;
    }

    if (weekId === null) {
      const { data, error } = await supabase.rpc("sync_next_week_needing_scores");
      if (error) throw new Error(`next week lookup failed: ${error.message}`);
      weekId = data as number | null;
    }

    if (weekId === null) {
      return json({ status: "nothing-to-do", reason: "no started week has unfinished games" });
    }

    const { data: week, error: weekError } = await supabase
      .from("weeks")
      .select("id, season, week_number, status")
      .eq("id", weekId)
      .single();
    if (weekError) throw new Error(`week lookup failed: ${weekError.message}`);

    const scores = await provider.fetchScores(week.season, week.week_number);

    // Unlike a lineless slate, an empty result here is routine, not an outage:
    // the sweep that lands in the minutes around a kickoff can find every game
    // still "pre". 200, and the next tick tries again. A real shape change in
    // the feed also lands here — which is why the count report below exists,
    // and why OPERATIONS.md says to run this by hand on its first game day.
    if (scores.length === 0) {
      return json({
        status: "no-scores",
        weekId,
        season: week.season,
        week: week.week_number,
        source: provider.source,
        reason: "provider reported no game in progress or final",
      });
    }

    const { data: applied, error: applyError } = await supabase.rpc(
      "sync_apply_week_scores",
      { p_week_id: weekId, p_scores: scores },
    );
    if (applyError) throw new Error(`apply failed: ${applyError.message}`);

    const result = Array.isArray(applied) ? applied[0] : applied;

    // fetched vs updated is the honesty check: rows the parser produced that
    // matched no games row (or arrived for an already-final game) show up as
    // the gap between these two numbers.
    return json({
      status: "ok",
      weekId,
      season: week.season,
      week: week.week_number,
      source: provider.source,
      fetched: scores.length,
      updated: result?.updated ?? 0,
      finals: result?.finals ?? null,
      remaining: result?.remaining ?? null,
      weekScored: result?.week_scored ?? false,
    });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
