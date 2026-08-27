"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "@/hooks/useSession";
import { IDLE_POLL_MS, pollDelay } from "@/lib/refresh";
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
  const userId = session.status === "signed-in" ? session.session.user.id : null;
  const [value, setValue] = useState<WeekContextValue>(EMPTY);
  const [nonce, setNonce] = useState(0);
  // When the last load finished, so the visibility handler can tell a real
  // return to the app from a quick flick between tabs.
  const loadedAt = useRef(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Reset when the identity changes — signing out, or a different account
  // signing in — so the previous user's data cannot render underneath the
  // new session while the refetch is in flight. A plain refresh() keeps the
  // current data on screen instead of blanking it.
  //
  // This runs during render (React's documented "adjusting state when a prop
  // changes" pattern) rather than as a setState call at the top of the effect
  // below: this repo's lint config (react-hooks/set-state-in-effect) flags
  // the latter, and for good reason here — an effect runs after paint, so a
  // synchronous setValue there can let one stale frame reach the screen
  // before the reset lands. Doing it in render avoids that frame entirely.
  const [lastUserId, setLastUserId] = useState(userId);
  if (session.status !== "checking" && lastUserId !== userId) {
    setLastUserId(userId);
    setValue((prev) =>
      prev.userId === userId && prev.phase === "ready"
        ? prev
        : { ...EMPTY, phase: "loading", signedIn: userId !== null, userId, refresh },
    );
  }

  useEffect(() => {
    // Signed-out is a normal state here, not an error: the board is public.
    // Only "checking" means wait.
    if (session.status === "checking") return;

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

      loadedAt.current = Date.now();
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
      loadedAt.current = Date.now();
      setValue({
        ...EMPTY,
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
        // A failed fetch says nothing about who is signed in. Spreading EMPTY
        // alone would erase that and show the sign-in form to a signed-in user.
        signedIn: userId !== null,
        userId,
        refresh,
      });
    });

    return () => {
      active = false;
    };
  }, [session, nonce, refresh, userId]);

  // Both re-pull paths below go through refresh(), which keeps the old data
  // on screen until the new load lands — phase only resets when the identity
  // changes — so neither ever flashes a skeleton.

  // Returning to the tab is the moment most likely to have missed something:
  // a phone unlocked during the 4:25 window, a tab left open since Thursday.
  // The threshold keeps a quick flick between apps from double-loading.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - loadedAt.current < 15_000) return;
      refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // While the tab stays open and visible, poll on the cadence of what is
  // actually in motion — see pollDelay. A failed load also retries on the
  // idle tick, so a transient network error recovers on its own instead of
  // dead-ending on the error screen. Depending on `value` re-arms this after
  // every load, which is what keeps the clock-dependent decision fresh: the
  // idle tick that crosses a kickoff comes back and re-arms itself fast.
  useEffect(() => {
    const delay =
      value.phase === "error"
        ? IDLE_POLL_MS
        : pollDelay(value.week, value.games, Date.now());
    if (delay === null) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, delay);
    return () => clearInterval(id);
  }, [value, refresh]);

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}
