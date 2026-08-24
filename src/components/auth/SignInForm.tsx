"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { absoluteUrl } from "@/lib/urls";
import { GOOGLE_AUTH_ENABLED } from "@/lib/constants";
import { useWeek } from "@/components/app/WeekProvider";
import { formatTotal, lineFor } from "@/lib/format";

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export function SignInForm() {
  const { games } = useWeek();
  const [email, setEmail] = useState("");
  const [send, setSend] = useState<SendState>({ status: "idle" });

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;

    setSend({ status: "sending" });
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: absoluteUrl("/auth/callback/") },
    });

    if (error) setSend({ status: "error", message: error.message });
    else setSend({ status: "sent", email: address });
  }

  if (send.status === "sent") {
    return (
      <Shell>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          We sent a sign-in link to{" "}
          <span className="text-[var(--color-text)]">{send.email}</span>. Open it
          on this device and you are in — there is no password to remember.
        </p>
        <button
          type="button"
          onClick={() => setSend({ status: "idle" })}
          className="mt-6 text-sm text-[var(--color-accent)] underline underline-offset-4"
        >
          Use a different email
        </button>
      </Shell>
    );
  }

  const pickCount = games.length * 2;

  return (
    <Shell>
      <LineTicker />

      <h1 className="wordmark rise mt-6 text-[4.5rem]">
        Perfect
        <br />
        <span className="text-gold">Sunday</span>
      </h1>

      <p className="rise rise-2 mt-5 text-sm leading-relaxed text-[var(--color-text-muted)]">
        Pick every over/under and every spread on the slate. Get them all right
        and win the prize.{" "}
        <span className="font-semibold whitespace-nowrap text-[var(--color-accent)]">
          Nobody will.
        </span>
      </p>

      <ul className="rise rise-3 mt-5 flex gap-2">
        <StatChip
          value={pickCount > 0 ? String(pickCount) : "Every"}
          label={pickCount > 0 ? "picks" : "game"}
        />
        <StatChip value="1" label="perfect run" />
        <StatChip value="$0" label="to enter" />
      </ul>

      <form onSubmit={sendLink} className="rise rise-4 mt-8">
        <label
          htmlFor="email"
          className="block text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
        />

        <button
          type="submit"
          disabled={send.status === "sending" || email.trim() === ""}
          className="btn btn-gold mt-4"
        >
          {send.status === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>

        {send.status === "error" && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Could not send that link:{" "}
            <span className="text-[var(--color-text)]">{send.message}</span>
          </p>
        )}
      </form>

      {/* Built, deliberately off. Turning it on needs Google Cloud console
          setup; a button that errors on tap is worse than no button. */}
      {GOOGLE_AUTH_ENABLED && (
        <button
          type="button"
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: absoluteUrl("/auth/callback/") },
            })
          }
          className="btn btn-ghost mt-3"
        >
          Continue with Google
        </button>
      )}

      <p className="mt-8 text-xs text-[var(--color-text-muted)]">
        No passwords, no deposit, no payment. Free to enter.
      </p>
    </Shell>
  );
}

/**
 * The week's real lines scrolling past, sportsbook-board style. Content is the
 * hook: a first-time visitor sees actual numbers to beat, not marketing. Games
 * without posted lines are skipped rather than shown as dashes.
 */
function LineTicker() {
  const { games } = useWeek();
  const items = games
    .filter((g) => g.spread !== null || g.total !== null)
    .map((g) => ({
      id: g.id,
      matchup: `${g.away_team} @ ${g.home_team}`,
      line: g.spread !== null ? `${g.home_team} ${lineFor(g.spread, "home")}` : null,
      total: g.total !== null ? `O/U ${formatTotal(g.total)}` : null,
    }));

  if (items.length === 0) return null;

  const strip = (
    <>
      {items.map((item) => (
        <span
          key={item.id}
          className="flex shrink-0 items-baseline gap-2 pr-8 text-xs whitespace-nowrap"
        >
          <span className="font-[family-name:var(--font-display)] text-sm font-bold uppercase">
            {item.matchup}
          </span>
          {item.line && <span className="tabular text-[var(--color-accent)]">{item.line}</span>}
          {item.total && <span className="tabular text-[var(--color-text-muted)]">{item.total}</span>}
        </span>
      ))}
    </>
  );

  return (
    <div className="ticker rise -mx-4" aria-hidden>
      {/* The strip twice over: the loop point lands exactly at -50%. */}
      <div className="ticker-track py-2">
        {strip}
        {strip}
      </div>
    </div>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <li className="flex flex-1 flex-col items-center rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
      <span className="tabular font-[family-name:var(--font-display)] text-2xl font-extrabold leading-none">
        {value}
      </span>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </span>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // The route-group layout owns the page frame — width, horizontal padding, and
  // the space under the tab bar. This only needs to sit roughly centred inside
  // it, so it must not restate min-h-dvh or the max width.
  return <div className="flex min-h-[70dvh] flex-col justify-center">{children}</div>;
}
