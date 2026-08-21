import { SHARE_DOMAIN } from "@/lib/constants";

/**
 * Pre-lock picks share. Same shape as the results grid — eight per line so it
 * never wraps on a narrow phone, moneyline block first, games in kickoff order
 * — but with team abbreviations instead of squares. Kickoff order is what lets
 * two people line their lists up and argue about the same game.
 *
 * Plain text on purpose. No image generation, no hosting, no load time; it
 * pastes into iMessage, WhatsApp and Slack identically.
 */
export function buildPicksShare(
  weekNumber: number,
  moneyline: string[],
  spread: string[],
): string {
  return [
    `Perfect Sunday — Week ${weekNumber}`,
    ...chunk(moneyline, 8),
    "moneyline",
    ...chunk(spread, 8),
    "spread",
    SHARE_DOMAIN,
  ].join("\n");
}

function chunk(items: string[], size: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += size) {
    lines.push(items.slice(i, i + size).join(" "));
  }
  return lines;
}

export type ShareOutcome = "shared" | "copied" | "failed";

/**
 * Uses the native share sheet where there is one — on iOS that opens straight
 * into Messages, which is where this product spreads — and falls back to the
 * clipboard on desktop.
 */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      // Dismissing the sheet throws AbortError. That is a decision, not a
      // failure, so do not fall through to copying behind the user's back.
      if (err instanceof Error && err.name === "AbortError") return "failed";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
