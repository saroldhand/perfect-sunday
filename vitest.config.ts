import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Node environment on purpose: everything under test is a pure function. No
// jsdom, no testing-library, no component rendering — adding those is a
// separate decision with its own cost.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
