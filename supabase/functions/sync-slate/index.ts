// sync-slate — the one Phase 2 job that has to be an Edge Function, because it
// is the only one that makes an outbound call. lock-week and score-games are
// pure SQL and run on pg_cron instead; see OPERATIONS.md.
//
// This file is deliberately thin. Everything that can be wrong in a way nobody
// notices lives somewhere testable:
//
//   - normalising a feed row, including the spread sign flip
//       -> _shared/oddsProvider.ts, covered by src/lib/oddsProvider.test.ts
//   - refusing a locked week, opening only a complete slate
//       -> private.apply_week_lines, covered by supabase/tests/lines.sql
//
// What is left here is fetch, hand over, report.
//
// Deploy:  supabase functions deploy sync-slate
// Schedule: see OPERATIONS.md. Nothing schedules it by default.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { nflverseProvider } from "../_shared/oddsProvider.ts";

// Both are injected by the Edge Function runtime. The service-role key is what
// lets this reach public.sync_apply_week_lines, which is granted to that role
// and no other — see 0016.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const provider = nflverseProvider;

Deno.serve(async (request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // A specific week can be named for a re-run; otherwise the database picks
    // the earliest not-yet-locked week that is still missing lines.
    let weekId: number | null = null;
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.weekId === "number") weekId = body.weekId;
    }

    if (weekId === null) {
      const { data, error } = await supabase.rpc("sync_next_week_needing_lines");
      if (error) throw new Error(`next week lookup failed: ${error.message}`);
      weekId = data as number | null;
    }

    if (weekId === null) {
      return json({ status: "nothing-to-do", reason: "no week is missing lines" });
    }

    const { data: week, error: weekError } = await supabase
      .from("weeks")
      .select("id, season, week_number, status")
      .eq("id", weekId)
      .single();
    if (weekError) throw new Error(`week lookup failed: ${weekError.message}`);

    const lines = await provider.fetchLines(week.season, week.week_number);

    // A feed that returns nothing is a bad run, not an empty slate. Passing it
    // through would be harmless today — apply_week_lines would update zero rows
    // and decline to open the week — but reporting it as success would hide a
    // provider outage until someone noticed the week never opened.
    if (lines.length === 0) {
      return json({
        status: "no-lines",
        weekId,
        season: week.season,
        week: week.week_number,
        lineSource: provider.lineSource,
        reason: "provider returned no complete lines for this week",
      }, 502);
    }

    const { data: applied, error: applyError } = await supabase.rpc(
      "sync_apply_week_lines",
      { p_week_id: weekId, p_line_source: provider.lineSource, p_lines: lines },
    );
    if (applyError) throw new Error(`apply failed: ${applyError.message}`);

    const result = Array.isArray(applied) ? applied[0] : applied;

    return json({
      status: "ok",
      weekId,
      season: week.season,
      week: week.week_number,
      lineSource: provider.lineSource,
      fetched: lines.length,
      updated: result?.updated ?? 0,
      missing: result?.missing ?? null,
      opened: result?.opened ?? false,
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
