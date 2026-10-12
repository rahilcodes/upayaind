import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@emails": path.resolve(__dirname, "emails"),
      "server-only": path.resolve(__dirname, "tests/setup/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup/env.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    fileParallelism: false,
  },
});
