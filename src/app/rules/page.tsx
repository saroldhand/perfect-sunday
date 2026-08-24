import Link from "next/link";
import { TERMS_VERSION } from "@/lib/constants";

export const metadata = { title: "Official Rules — Perfect Sunday" };

// DRAFT. This is a working outline covering the categories sweepstakes rules
// are expected to address. It has not been reviewed by a lawyer and must be
// before the game is opened past a friends-and-family test. See SPEC.md §9.
export default function Rules() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="text-sm text-[var(--color-text-muted)] underline underline-offset-4"
      >
        Back
      </Link>

      <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
        Official Rules
      </h1>
      <p className="eyebrow mt-3">Version {TERMS_VERSION}</p>

      <div className="card mt-6 p-5">
        <p className="text-sm text-[var(--color-text-muted)]">
          <span className="text-[var(--color-text)]">Draft.</span> Perfect Sunday
          is currently a private test among friends. These rules are an outline,
          not a reviewed legal document, and will be replaced before the game is
          opened to the public.
        </p>
      </div>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
        <Section title="No purchase necessary">
          Entry is free. There is no payment, deposit, or wager at any point, and
          nothing about the prize depends on how many people enter.
        </Section>

        <Section title="How to enter">
          Pick the over/under and the spread for every game on the week&rsquo;s
          slate before the posted lock time. An entry counts only if every pick
          is in — a partial set is not scored and does not appear on that
          week&rsquo;s leaderboard. The lock time is shown on the pick screen and
          is normally Thursday 4:00 PM Eastern, earlier in weeks where a game
          kicks off before then.
        </Section>

        <Section title="How a winner is determined">
          A week is won by an entry in which every over/under and every spread is
          correct. A combined score that lands exactly on the total, and a
          spread that lands exactly on the number, both count in the
          entrant&rsquo;s favour.
        </Section>

        <Section title="Prize and multiple winners">
          The posted prize for a perfect week is $1,000. If more than one entrant
          goes perfect in the same week, the prize is divided evenly among them —
          three winners receive $333.33 each, not $1,000 each.
        </Section>

        <Section title="Odds">
          Long. A perfect week across a typical sixteen-game slate is on the order
          of one in 665 million per entry. Expect to lose.
        </Section>

        <Section title="Changes to these rules">
          Each entrant&rsquo;s acceptance is recorded against a specific version
          of this document. If the rules change, you will be asked to accept the
          new version before entering again rather than having it applied
          silently.
        </Section>

        <Section title="Sponsor">
          To be completed before public launch.
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold uppercase tracking-tight text-[var(--color-text)]">
        {title}
      </h2>
      <p className="mt-2">{children}</p>
    </section>
  );
}
