"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/hooks/useSession";
import { getProfile, type Profile } from "@/lib/profile";
import { getCurrentWeek, getGames, getTeams, type Game, type Team, type Week } from "@/lib/week";
import { getPicks, type PickMap } from "@/lib/picks";
import { PickDeck } from "@/components/picks/PickDeck";
import { formatLockTime } from "@/lib/format";

type Data = {
  profile: Profile;
  week: Week | null;
  games: Game[];
  teams: Record<string, Team>;
  picks: PickMap;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Data };

export default function Picks() {
  const session = useSession();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (session.status === "signed-out") {
      router.replace("/");
      return;
    }
    if (session.status !== "signed-in") return;

    const userId = session.session.user.id;
    let active = true;

    (async () => {
      const profile = await getProfile(userId);
      if (!active) return;
      if (!profile) {
        router.replace("/welcome");
        return;
      }

      const [week, teams] = await Promise.all([getCurrentWeek(), getTeams()]);
      if (!active) return;

      const games = week ? await getGames(week.id) : [];
      const picks = week ? await getPicks(userId, games.map((g) => g.id)) : {};
      if (!active) return;

      setState({ status: "ready", data: { profile, week, games, teams, picks } });
    })().catch((err: unknown) => {
      if (active) {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return () => {
      active = false;
    };
  }, [session, router]);

  if (session.status === "checking" || state.status === "loading") {
    return (
      <main className="mx-auto w-full max-w-md px-4 pt-6" aria-hidden>
        <div className="flex gap-1">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="h-[3px] flex-1 rounded-full bg-[var(--color-border)]" />
          ))}
        </div>
        <div className="mt-6 h-72 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <Shell>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold uppercase">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{state.message}</p>
      </Shell>
    );
  }

  const { week, games, teams, picks, profile } = state.data;

  // Waiting-for-lines state. A week stays upcoming until every game on the
  // slate has a complete line, because a number that changes after someone
  // picks against it is a broken promise.
  if (!week || week.status === "upcoming" || games.length === 0) {
    return (
      <Shell>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
          {week ? `Week ${week.week_number} lines drop Tuesday morning` : "No week is open yet"}
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {week
            ? "Every game needs a posted line before picks open. Check back in the morning."
            : "The first slate has not been loaded yet."}
        </p>
        {week && (
          <p className="mt-6 text-xs text-[var(--color-text-muted)]">
            Locks {formatLockTime(week.locks_at)}
          </p>
        )}
        <SignOut />
      </Shell>
    );
  }

  return (
    <>
      <PickDeck
        userId={profile.id}
        week={week}
        games={games}
        teams={teams}
        initialPicks={picks}
      />
      <div className="mx-auto w-full max-w-md px-4 pb-8">
        <SignOut />
      </div>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-md px-6 py-12">{children}</main>;
}

function SignOut() {
  const router = useRouter();
  return (
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
  );
}
