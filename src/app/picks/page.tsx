"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/hooks/useSession";
import { getProfile, type Profile } from "@/lib/profile";

// Placeholder for the pick deck. It exists so the auth flow has a real
// destination and so signing in can be verified end to end.
export default function Picks() {
  const session = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (session.status === "signed-out") {
      router.replace("/");
      return;
    }
    if (session.status !== "signed-in") return;

    let active = true;
    getProfile(session.session.user.id).then((p) => {
      if (!active) return;
      if (!p) router.replace("/welcome");
      else setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [session, router]);

  if (session.status === "checking" || !profile) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-12" aria-hidden>
        <div className="h-8 w-1/2 rounded bg-[var(--color-surface)]" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
        You are in
      </h1>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">
        Signed in as{" "}
        <span className="text-[var(--color-text)]">{profile.display_name}</span>.
      </p>

      <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <p className="text-sm text-[var(--color-text-muted)]">
          No week is open yet. The pick deck lands here — one game at a time,
          moneyline and spread, autosaving as you go.
        </p>
      </div>

      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace("/");
        }}
        className="mt-8 text-sm text-[var(--color-text-muted)] underline underline-offset-4"
      >
        Sign out
      </button>
    </main>
  );
}
