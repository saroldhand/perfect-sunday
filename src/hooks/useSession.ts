"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export type SessionState =
  // "checking" is the real first frame of every page load: the session lives in
  // localStorage and is read asynchronously, so there is no server render that
  // already knows. Pages must show a skeleton here, never a signed-out screen,
  // or signed-in users get a flash of the wrong UI on every visit.
  | { status: "checking" }
  | { status: "signed-out" }
  | { status: "signed-in"; session: Session };

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "checking" });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(
        data.session
          ? { status: "signed-in", session: data.session }
          : { status: "signed-out" },
      );
    });

    // Covers the callback page, where detectSessionInUrl finishes the code
    // exchange after the initial getSession has already resolved as signed-out.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState(
        session ? { status: "signed-in", session } : { status: "signed-out" },
      );
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
