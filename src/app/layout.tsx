import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";

// Condensed grotesque for team codes and numbers — the things the eye scans.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Same reason as in manifest.ts: metadata icon hrefs are opaque strings, so the
// basePath has to be written in.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Perfect Sunday",
  description:
    "Pick every over/under and every spread on the NFL slate. Get them all right and win the prize.",
  applicationName: "Perfect Sunday",
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
  themeColor: "#0B0D10",
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
    <html lang="en">
      <body className={`${oswald.variable} ${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
