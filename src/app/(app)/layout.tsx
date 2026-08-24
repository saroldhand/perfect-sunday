"use client";

import { WeekProvider } from "@/components/app/WeekProvider";
import { TabBar } from "@/components/app/TabBar";
import { AppFrame } from "@/components/app/AppFrame";

// `(app)` is a route group: shared layout, no path segment. The pick deck
// deliberately sits outside it — a tab bar under a swipe-driven full-bleed
// card would steal thumb space and put a horizontal target next to a
// horizontal gesture.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WeekProvider>
      <AppFrame>{children}</AppFrame>
      <TabBar />
    </WeekProvider>
  );
}
