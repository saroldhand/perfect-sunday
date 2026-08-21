// GitHub Pages serves the app from /perfect-sunday, so anything handed to an
// external system — Supabase's emailRedirectTo, a share link — needs the full
// origin *and* that prefix. next/link handles basePath for in-app navigation;
// this is for the cases that leave the app and come back.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Absolute URL for an in-app path. Pass a leading-slash path, e.g.
 * absoluteUrl("/auth/callback/").
 *
 * trailingSlash is on, so paths should carry one: Pages resolves
 * /auth/callback/ to that directory's index.html and has no rewrite for the
 * extensionless form.
 */
export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return `${BASE_PATH}${path}`;
  return `${window.location.origin}${BASE_PATH}${path}`;
}
