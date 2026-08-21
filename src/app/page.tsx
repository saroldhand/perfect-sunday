"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { accentColor } from "@/lib/teamColor";

type Team = {
  abbr: string;
  name: string;
  primary_color: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; teams: Team[] };

export default function Home() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    // Reads teams as an anonymous visitor. This is the end-to-end proof that
    // the static bundle reaches Supabase and that the teams_select_public
    // policy allows a signed-out read.
    supabase
      .from("teams")
      .select("abbr, name, primary_color")
      .order("abbr")
      .then(({ data, error }) => {
        if (error) setState({ status: "error", message: error.message });
        else setState({ status: "ready", teams: data ?? [] });
      });
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-10">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold uppercase tracking-tight">
          Perfect Sunday
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Pick every moneyline and every spread. Get them all right and win the
          prize. Nobody will.
        </p>
      </header>

      <section
        className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        aria-live="polite"
      >
        <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
          Backend check
        </h2>

        {state.status === "loading" && (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-9 rounded-[var(--radius-target)] bg-[var(--color-surface-raised)]"
              />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Could not reach Supabase:{" "}
            <span className="text-[var(--color-text)]">{state.message}</span>
          </p>
        )}

        {state.status === "ready" && (
          <>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              <span className="tabular text-[var(--color-text)]">
                {state.teams.length}
              </span>{" "}
              teams loaded from Supabase as a signed-out visitor.
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {state.teams.map((team) => (
                <li
                  key={team.abbr}
                  title={team.name}
                  className="flex items-center gap-2 rounded-[var(--radius-target)] bg-[var(--color-surface-raised)] py-2 pl-0 pr-2"
                  style={{
                    borderLeft: `3px solid ${accentColor(team.primary_color)}`,
                  }}
                >
                  <span className="font-[family-name:var(--font-display)] pl-2 text-lg font-semibold uppercase">
                    {team.abbr}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="mt-6 text-xs text-[var(--color-text-muted)]">
        Phase 1 in progress — pick deck next.
      </p>
    </main>
  );
}
