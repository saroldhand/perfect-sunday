"use client";

import { useWeek } from "@/components/app/WeekProvider";

/**
 * The page frame. Separate from the layout because it needs `useWeek()`, and
 * the layout is the component that renders the provider — a consumer cannot
 * live in the same component as its provider.
 *
 * Signed in, it also carries the brand strip: the wordmark on the left, the
 * display name on the right. Signed out the strip stays hidden — the sign-in
 * hero is the wordmark at full size, and two of them would fight.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { signedIn, profile } = useWeek();
  return (
    <main
      className={`mx-auto w-full max-w-md px-4 pt-6 ${signedIn ? "pb-28" : "pb-8"}`}
    >
      {signedIn && (
        <header className="mb-6 flex items-baseline justify-between">
          <span className="wordmark text-xl">
            Perfect <span className="text-gold">Sunday</span>
          </span>
          {profile && (
            <span className="max-w-[50%] truncate text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
              {profile.display_name}
            </span>
          )}
        </header>
      )}
      {children}
    </main>
  );
}
