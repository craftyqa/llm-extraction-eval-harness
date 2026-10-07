import { defineConfig } from "vitest/config";

// Unit tests must run without Ollama: mock model calls.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "reports/**"],
    environment: "node",
  },
});
