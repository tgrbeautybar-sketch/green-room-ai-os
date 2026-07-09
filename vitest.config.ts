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
    },
  },
});
