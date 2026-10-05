import Link from "next/link";

const linkClass = "underline underline-offset-4";

/** Rules and privacy, side by side, wherever the app shows a footer. */
export function FooterLinks() {
  return (
    <p className="flex gap-4 text-xs text-[var(--color-text-muted)]">
      <Link href="/rules" className={linkClass}>
        Official rules
      </Link>
      <Link href="/privacy" className={linkClass}>
        Privacy
      </Link>
    </p>
  );
}
