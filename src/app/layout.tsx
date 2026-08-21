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

export const metadata: Metadata = {
  title: "Perfect Sunday",
  description:
    "Pick every moneyline and every spread on the NFL slate. Get them all right and win the prize.",
};

export const viewport: Viewport = {
  themeColor: "#0B0D10",
  // The pick targets are already far above 44pt; zoom stays enabled because
  // disabling it is an accessibility failure, not a polish detail.
  width: "device-width",
  initialScale: 1,
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
