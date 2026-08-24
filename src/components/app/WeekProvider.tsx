"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { getProfile, type Profile } from "@/lib/profile";
import {
  getCurrentWeek,
  getGames,
  getLastScoredWeek,
  getTeams,
  type Game,
  type Team,
  type Week,
} from "@/lib/week";
import { getResults, type ResultMap } from "@/lib/picks";
import { getEntries } from "@/lib/entries";
import type { EntryRow } from "@/lib/leaderboard";

export type WeekContextValue = {
  phase: "loading" | "ready" | "error";
  error: string | null;
  signedIn: boolean;
  userId: string | null;
  profile: Profile | null;
  week: Week | null;
  games: Game[];
  teams: Record<string, Team>;
  results: ResultMap;
  /** The week whose standings the board shows: the current one once it is
   *  locked, otherwise the last finished week. */
  boardWeek: Week | null;
  boardEntries: EntryRow[];
  refresh: () => void;
};

const EMPTY: WeekContextValue = {
  phase: "loading",
  error: null,
  signedIn: false,
  userId: null,
  profile: null,
  week: null,
  games: [],
  teams: {},
  results: {},
  boardWeek: null,
  boardEntries: [],
  refresh: () => {},
};

const WeekContext = createContext<WeekContextValue>(EMPTY);

export function useWeek() {
  return useContext(WeekContext);
}

/**
 * Loads everything the three tabbed screens need, once.
 *
 * It lives in the route-group layout because an App Router layout does not
 * unmount while navigation stays within its own child routes. Fetching per
 * screen instead would refetch week, games, and teams on every tab switch and
 * flash a skeleton each time — which is the exact experience a tab bar exists
 * to avoid.
 */
export function WeekProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [value, setValue] = useState<WeekContextValue>(EMPTY);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Signed-out is a normal state here, not an error: the board is public.
    // Only "checking" means wait.
    if (session.status === "checking") return;

    const userId = session.status === "signed-in" ? session.session.user.id : null;
    let active = true;

    (async () => {
      const [week, teams, profile] = await Promise.all([
        getCurrentWeek(),
        getTeams(),
        userId ? getProfile(userId) : Promise.resolve(null),
      ]);
      if (!active) return;

      const games = week ? await getGames(week.id) : [];
      if (!active) return;

      const results =
        userId && games.length > 0
          ? await getResults(userId, games.map((g) => g.id))
          : {};
      if (!active) return;

      // Entries exist only from lock onward, so before that the board falls
      // back to the last finished week.
      const showsCurrent =
        week !== null && (week.status === "locked" || week.status === "scored");
      const boardWeek = showsCurrent ? week : await getLastScoredWeek();
      if (!active) return;

      const boardEntries = boardWeek ? await getEntries(boardWeek.id) : [];
      if (!active) return;

      setValue({
        phase: "ready",
        error: null,
        signedIn: userId !== null,
        userId,
        profile,
        week,
        games,
        teams,
        results,
        boardWeek,
        boardEntries,
        refresh,
      });
    })().catch((err: unknown) => {
      if (!active) return;
      setValue({
        ...EMPTY,
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
        refresh,
      });
    });

    return () => {
      active = false;
    };
  }, [session, nonce, refresh]);

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}
