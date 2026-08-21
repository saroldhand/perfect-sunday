"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/hooks/useSession";
import { getProfile, landingRoute } from "@/lib/profile";
import { absoluteUrl } from "@/lib/urls";
import { GOOGLE_AUTH_ENABLED } from "@/lib/constants";

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export default function SignIn() {
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [send, setSend] = useState<SendState>({ status: "idle" });

  // Someone arriving with a live session should never see the sign-in screen.
  useEffect(() => {
    if (session.status !== "signed-in") return;
    let active = true;
    getProfile(session.session.user.id)
      .then((profile) => {
        if (active) router.replace(landingRoute(profile));
      })
      .catch(() => {
        if (active) router.replace("/welcome");
      });
    return () => {
      active = false;
    };
  }, [session, router]);

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

  if (session.status === "checking") {
    return <Skeleton />;
  }

  if (send.status === "sent") {
    return (
      <Shell>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
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

  return (
    <Shell>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold uppercase tracking-tight">
        Perfect Sunday
      </h1>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">
        Pick every moneyline and every spread on the slate. Get them all right
        and win the prize. Nobody will.
      </p>

      <form onSubmit={sendLink} className="mt-8">
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
          className="mt-4 min-h-14 w-full rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10] transition-colors duration-[120ms] disabled:opacity-40"
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
          className="mt-3 min-h-14 w-full rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-semibold"
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      {children}
    </main>
  );
}

function Skeleton() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12"
      aria-hidden
    >
      <div className="h-10 w-2/3 rounded bg-[var(--color-surface)]" />
      <div className="mt-4 h-4 w-full rounded bg-[var(--color-surface)]" />
      <div className="mt-2 h-4 w-4/5 rounded bg-[var(--color-surface)]" />
      <div className="mt-8 h-14 w-full rounded-[var(--radius-target)] bg-[var(--color-surface)]" />
    </main>
  );
}
