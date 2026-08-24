"use client";

import { useEffect, useRef, useState } from "react";
import { shareText } from "@/lib/share";

type Props = {
  /**
   * Built on press, not on render. The text is only needed if the button is
   * actually used, and picks change under it while the week is open.
   */
  build: () => string;
  label: string;
  className?: string;
};

/**
 * Share, plus the "Copied" confirmation the clipboard fallback needs.
 *
 * Shared between the review screen and the hub so the two entry points cannot
 * drift — the same argument that moved PickSummaryRow out of ReviewScreen. A
 * share that says "Copied" in one place and nothing in the other is the kind of
 * difference nobody notices until someone reports the button as broken.
 */
export function ShareButton({ build, label, className = "btn btn-gold mt-6" }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancelled on unmount, so navigating away mid-toast does not leave a timer
  // pointing at a component that is gone.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function flash(message: string) {
    setToast(message);
    // Restarted rather than left running, so a second press re-shows the
    // message for its full two seconds instead of inheriting the old timer.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2000);
  }

  async function onClick() {
    const outcome = await shareText(build());
    // The native sheet is its own feedback. Only the fallbacks need a word.
    if (outcome === "shared") return;
    flash(outcome === "copied" ? "Copied" : "Could not share");
  }

  return (
    <>
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
      {toast && (
        <p
          role="status"
          className="mt-3 text-center text-sm text-[var(--color-text-muted)]"
        >
          {toast}
        </p>
      )}
    </>
  );
}
