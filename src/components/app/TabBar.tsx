"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeek } from "@/components/app/WeekProvider";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/week", label: "My Week" },
  { href: "/leaderboard", label: "Board" },
] as const;

// trailingSlash is on, so usePathname returns "/week/". basePath is stripped
// by Next before we see it, so these comparisons stay environment-independent.
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function TabBar() {
  const pathname = usePathname();
  const { signedIn, phase } = useWeek();

  // Two of three tabs lead nowhere useful signed-out, and the board carries
  // its own sign-in call to action instead.
  if (phase === "loading" || !signedIn) return null;

  const current = normalize(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 border-t border-[var(--color-border)] bg-[rgba(9,14,26,0.88)] backdrop-blur-md"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex w-full max-w-md">
        {TABS.map((tab) => {
          const active = current === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold uppercase tracking-widest ${
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                {tab.label}
                {/* The angled gold slash under the active tab: the brand
                    device doing the state's job, not a decoration. */}
                <span
                  aria-hidden
                  className={`h-[3px] w-5 skew-x-[-18deg] ${
                    active
                      ? "bg-[linear-gradient(115deg,#ffd44d,#ff7a1a)]"
                      : "bg-transparent"
                  }`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
