"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";
import { createProfile, isDisplayNameAvailable } from "@/lib/profile";

const MIN = 2;
const MAX = 24; // matches the profiles_display_name_len check constraint

type NameCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "free" }
  | { status: "taken"; suggestion: string }
  | { status: "invalid"; message: string };

function suggest(name: string) {
  const stem = name.slice(0, MAX - 2);
  return `${stem}${Math.floor(Math.random() * 90) + 10}`;
}

export default function Welcome() {
  const session = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [check, setCheck] = useState<NameCheck>({ status: "idle" });
  const [agreed, setAgreed] = useState(false); // never pre-ticked
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/");
  }, [session, router]);

  const runCheck = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < MIN || trimmed.length > MAX) {
      setCheck({
        status: "invalid",
        message: `Between ${MIN} and ${MAX} characters.`,
      });
      return;
    }
    setCheck({ status: "checking" });
    try {
      const free = await isDisplayNameAvailable(trimmed);
      setCheck(
        free
          ? { status: "free" }
          : { status: "taken", suggestion: suggest(trimmed) },
      );
    } catch {
      // A failed lookup must not block signup — the unique constraint is the
      // real guard, so fall through and let the insert decide.
      setCheck({ status: "idle" });
    }
  }, []);

  function onNameChange(value: string) {
    setName(value);
    setError(null);
    setCheck({ status: "idle" });
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runCheck(value), 350);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (session.status !== "signed-in" || !agreed) return;

    setSubmitting(true);
    setError(null);
    try {
      await createProfile(session.session.user.id, name.trim());
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "TAKEN") {
        setCheck({ status: "taken", suggestion: suggest(name.trim()) });
      } else {
        setError(message);
      }
      setSubmitting(false);
    }
  }

  if (session.status === "checking") {
    return (
      <main
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6"
        aria-hidden
      >
        <div className="h-10 w-2/3 rounded bg-[var(--color-surface)]" />
        <div className="mt-8 h-14 w-full rounded-[var(--radius-target)] bg-[var(--color-surface)]" />
      </main>
    );
  }

  const nameUsable =
    name.trim().length >= MIN &&
    name.trim().length <= MAX &&
    check.status !== "taken" &&
    check.status !== "invalid";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <p className="eyebrow rise mb-2">Almost in</p>
      <h1 className="rise font-[family-name:var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
        Pick a name
      </h1>
      <p className="rise rise-2 mt-3 text-sm text-[var(--color-text-muted)]">
        This is what shows on leaderboards.
      </p>

      <form onSubmit={submit} className="mt-8">
        <input
          id="display_name"
          type="text"
          required
          autoFocus
          autoComplete="nickname"
          maxLength={MAX}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Display name"
          aria-describedby="name-status"
          className="w-full rounded-[var(--radius-target)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
        />

        <div
          id="name-status"
          aria-live="polite"
          className="mt-2 min-h-5 text-sm text-[var(--color-text-muted)]"
        >
          {check.status === "checking" && "Checking…"}
          {check.status === "free" && "Available."}
          {check.status === "invalid" && check.message}
          {check.status === "taken" && (
            <>
              Taken. Try{" "}
              <button
                type="button"
                onClick={() => onNameChange(check.suggestion)}
                className="text-[var(--color-accent)] underline underline-offset-4"
              >
                {check.suggestion}
              </button>
              .
            </>
          )}
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-text-muted)]">
            I agree to the{" "}
            <Link
              href="/rules"
              className="text-[var(--color-text)] underline underline-offset-4"
            >
              Official Rules
            </Link>{" "}
            and Terms.
          </span>
        </label>

        <button
          type="submit"
          disabled={!nameUsable || !agreed || submitting}
          className="btn btn-gold mt-6"
        >
          {submitting ? "Setting up…" : "Start picking"}
        </button>

        {error && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Could not save that:{" "}
            <span className="text-[var(--color-text)]">{error}</span>
          </p>
        )}
      </form>
    </main>
  );
}
