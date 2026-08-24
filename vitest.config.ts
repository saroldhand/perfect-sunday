import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

// Node environment on purpose: everything under test is a pure function. No
// jsdom, no testing-library, no component rendering — adding those is a
// separate decision with its own cost.
export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Unlike `next dev`/`next build`, Vitest never inlines
    // `process.env.NEXT_PUBLIC_*` at compile time and never reads .env on its
    // own — modules that read those vars at import time (src/lib/supabase/client.ts)
    // would otherwise throw the moment a test imports them. loadEnv is Vite's
    // own .env reader; passing '' as the prefix loads every variable, not just
    // VITE_-prefixed ones.
    env: loadEnv(mode, process.cwd(), ""),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
}));
