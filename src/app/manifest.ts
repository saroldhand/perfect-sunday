import type { MetadataRoute } from "next";

// Every path in here is written with the basePath prefix explicitly. Next
// rewrites hrefs it controls, but the strings inside a manifest are opaque to
// it — a start_url of "/" on a project Pages site opens github.io's root, and
// an installed icon 404s. This is the single most likely way to ship a broken
// Add to Home Screen.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Perfect Sunday",
    short_name: "Perfect Sunday",
    description:
      "Pick every over/under and every spread on the NFL slate. Get them all right and win the prize.",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#101A2E",
    theme_color: "#101A2E",
    icons: [
      {
        src: `${basePath}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icons/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
