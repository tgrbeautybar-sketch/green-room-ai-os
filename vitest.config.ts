import { defineConfig } from "vitest/config";
import path from "path";

// Minimal config — this project only unit-tests pure lib/ functions (no DOM,
// no Next.js runtime needed).
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // See test/stubs/server-only.js — the real package is only ever
      // resolved by Next's own bundler, not plain Node/Vitest.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.js"),
    },
  },
});
