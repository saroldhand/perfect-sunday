"use client";

import { useWeek } from "@/components/app/WeekProvider";

/**
 * The page frame. Separate from the layout because it needs `useWeek()`, and
 * the layout is the component that renders the provider — a consumer cannot
 * live in the same component as its provider.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { signedIn } = useWeek();
  return (
    <main
      className={`mx-auto w-full max-w-md px-4 pt-6 ${signedIn ? "pb-28" : "pb-8"}`}
    >
      {children}
    </main>
  );
}
