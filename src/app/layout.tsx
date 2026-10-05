import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Inter } from "next/font/google";
import "./globals.css";
import { SHARE_DOMAIN } from "@/lib/constants";

// Heavy American condensed for team codes, numerals, and headlines — the
// broadcast voice of the product. Variable, so 900 is available for heroes
// without shipping separate cuts; opsz keeps big sizes display-tight.
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Same reason as in manifest.ts: metadata icon hrefs are opaque strings, so the
// basePath has to be written in.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Link unfurls need absolute URLs, and a crawler has no basePath to resolve
// against. Built from SHARE_DOMAIN rather than metadataBase-relative paths:
// SHARE_DOMAIN already carries the /perfect-sunday prefix, and a leading-slash
// path resolved against a metadataBase drops it. When a domain is bought, this
// follows SHARE_DOMAIN with no edit here.
const siteUrl = `https://${SHARE_DOMAIN}/`;

// The unfurl is the first thing a friend sees in the group chat, before they
// ever tap: without it the link renders bare and reads like a phishing test.
// public/og.png is a 1200×630 render of the wordmark; it states the prize, so
// it has to be re-rendered if the prize ever changes.
const unfurlTitle = "Perfect Sunday — free NFL pick'em";
const unfurlDescription =
  "Pick every winner and every over/under on the NFL slate. Go perfect, win $1,000.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Perfect Sunday",
  description:
    "Pick every over/under and every winner on the NFL slate. Get them all right and win the prize.",
  applicationName: "Perfect Sunday",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Perfect Sunday",
    title: unfurlTitle,
    description: unfurlDescription,
    images: [
      {
        url: `${siteUrl}og.png`,
        width: 1200,
        height: 630,
        alt: "Perfect Sunday — free NFL pick'em. Go perfect, win $1,000.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: unfurlTitle,
    description: unfurlDescription,
    images: [`${siteUrl}og.png`],
  },
  appleWebApp: {
    capable: true,
    title: "Perfect Sunday",
    // Matches the page background, so the status bar does not sit in a white
    // band once the app is launched from the home screen.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: `${basePath}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${basePath}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `${basePath}/icons/apple-touch-icon.png`, sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#101A2E",
  // The pick targets are already far above 44pt; zoom stays enabled because
  // disabling it is an accessibility failure, not a polish detail.
  width: "device-width",
  initialScale: 1,
  // Lets the deck's sticky footer sit against the home indicator, which is what
  // env(safe-area-inset-bottom) in PickDeck is padding around.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variable classes must sit on <html>, not <body>: the theme
    // declares --font-display on :root, and a custom property is computed at
    // the element that declares it — on :root, a var(--font-big-shoulders)
    // defined only on <body> is invisible, and every descendant inherits the
    // already-failed value. On <body> the display font silently never loads.
    <html lang="en" className={`${bigShoulders.variable} ${inter.variable}`}>
      <body className="antialiased">
        {/* Fixed so iOS cannot scroll the stadium light away with the page. */}
        <div aria-hidden className="floodlight" />
        {children}
      </body>
    </html>
  );
}
