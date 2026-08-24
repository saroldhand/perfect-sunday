"use client";

import { WeekProvider } from "@/components/app/WeekProvider";
import { TabBar } from "@/components/app/TabBar";

// `(app)` is a route group: shared layout, no path segment. The pick deck
// deliberately sits outside it — a tab bar under a swipe-driven full-bleed
// card would steal thumb space and put a horizontal target next to a
// horizontal gesture.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WeekProvider>
      {/* pb-28 clears the fixed tab bar; the bar adds the safe-area inset. */}
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6">{children}</main>
      <TabBar />
    </WeekProvider>
  );
}
