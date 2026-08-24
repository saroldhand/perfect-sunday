"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";
import { getProfile, landingRoute } from "@/lib/profile";

// Supabase reports a dead or already-used link by appending an error to the
// redirect rather than failing the exchange, so it has to be read off the URL.
function readLinkError(): string | null {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return (
    url.searchParams.get("error_description") ??
    hash.get("error_description") ??
    null
  );
}

// The URL is external state that never changes while this page is mounted, so
// it is read through useSyncExternalStore rather than copied into state by an
// effect. That keeps the prerendered HTML and the first client render in
// agreement: the static build has no location, so its snapshot is null.
const subscribeToNothing = () => () => {};

export default function AuthCallback() {
  const session = useSession();
  const router = useRouter();

  const linkError = useSyncExternalStore(
    subscribeToNothing,
    readLinkError,
    () => null,
  );

  // Where the magic link lands. detectSessionInUrl performs the PKCE exchange
  // as the client initialises, so this page waits for that and then routes — to
  // the display-name gate for a new user, to the hub for a returning one.
  useEffect(() => {
    if (linkError || session.status !== "signed-in") return;
    let active = true;
    getProfile(session.session.user.id)
      .then((profile) => {
        if (active) router.replace(landingRoute(profile));
      })
      .catch(() => {
        if (active) router.replace("/welcome");
      });
    return () => {
      active = false;
    };
  }, [session, router, linkError]);

  // A link that is expired, already used, or opened in a different browser than
  // the one that requested it (PKCE keeps the verifier local) ends up here.
  if (linkError || session.status === "signed-out") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold uppercase tracking-tight">
          That link did not work
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {linkError ??
            "Sign-in links are single use and expire. Open the newest one on the same device you asked for it from."}
        </p>
        <Link
          href="/"
          className="mt-6 flex min-h-14 items-center justify-center rounded-[var(--radius-target)] bg-[var(--color-accent)] px-4 text-base font-semibold text-[#0B0D10]"
        >
          Send a new link
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <p className="text-sm text-[var(--color-text-muted)]">Signing you in…</p>
    </main>
  );
}
