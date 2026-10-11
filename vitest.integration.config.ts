import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
    hookTimeout: 60000,
    maxWorkers: 1,
  },
});
