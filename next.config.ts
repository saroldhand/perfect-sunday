import type { NextConfig } from "next";

// GitHub Pages serves this project from /perfect-sunday, so every route and
// asset needs that prefix. It is read from the environment rather than
// hardcoded: moving to a custom domain later means clearing one CI variable
// instead of editing code. CI sets NEXT_PUBLIC_BASE_PATH=/perfect-sunday;
// local dev leaves it empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Pages serves static files only. This disables middleware, route handlers,
  // server actions, and the image optimizer — all logic lives client-side or
  // in Supabase.
  output: "export",
  basePath,
  // Without this, Pages 404s on every nested route: it resolves /picks/ to
  // /picks/index.html but has no rewrite for the extensionless /picks.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
