import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "evals",
          include: ["evals/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,
        },
      },
    ],
  },
});
