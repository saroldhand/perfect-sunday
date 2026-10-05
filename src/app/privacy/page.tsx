import Link from "next/link";

export const metadata = { title: "Privacy — Perfect Sunday" };

// Written for the friends-and-family test, like the rules page beside it. Every
// claim here is checked against what the build and the schema actually do — no
// analytics, session in localStorage, one cascade from auth.users that takes a
// player's picks and entries with them. If any of those changes, this page
// changes in the same commit. The deletion path ("ask whoever invited you") is
// only honest while every player came in through someone the operator knows;
// it needs a real contact before the link goes anywhere public. See SPEC.md §9.
export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="text-sm text-[var(--color-text-muted)] underline underline-offset-4"
      >
        Back
      </Link>

      <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-extrabold uppercase tracking-tight">
        Privacy
      </h1>
      <p className="eyebrow mt-3">The short version</p>

      <div className="card mt-6 p-5">
        <p className="text-sm text-[var(--color-text-muted)]">
          We keep your email so you can sign in, a display name so the
          leaderboard has something to show, and your picks so they can be
          graded. That is all of it. Nothing is sold, and there are no ads or
          trackers.
        </p>
      </div>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
        <Section title="What we collect">
          Your email address. The display name you choose. Your picks, and how
          each one was graded. Which version of the Official Rules you
          accepted, and when. Nothing else is asked for, and nothing is
          collected in the background.
        </Section>

        <Section title="Who can see what">
          Your email is never shown to anyone. Your display name is public — it
          is how the leaderboard tells players apart. Your picks are private
          until the week locks; after that, everyone&rsquo;s picks and results
          for that week are visible to everyone, which is what makes the board
          worth looking at.
        </Section>

        <Section title="What we email you">
          Sign-in links, and nothing else today. If that ever changes, it will
          be about the game itself — a reminder before the lock, say — and you
          will be able to turn it off.
        </Section>

        <Section title="Where it lives">
          Accounts, picks and results are stored with Supabase, which also sends
          the sign-in email. The site itself is served by GitHub Pages, which,
          like any web host, sees the address your request comes from. Your
          sign-in session is kept in your browser&rsquo;s local storage. We use
          no analytics, no advertising tools, and no cookies.
        </Section>

        <Section title="Never sold">
          Your information is not sold, rented, or shared with anyone for
          marketing. It exists to run the game and for nothing else.
        </Section>

        <Section title="Getting deleted">
          Perfect Sunday is a private test among friends right now, so this is
          done by hand: ask whoever invited you. Deleting an account removes
          your email, your display name, and every pick and result you have,
          including your place on past leaderboards.
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
