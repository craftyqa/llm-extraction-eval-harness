import { defineConfig } from "vitest/config";

// Unit tests must run without Ollama: mock model calls.
// Live tests (*.live.test.ts) need Ollama and run with `npm run test:live`.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "reports/**", "**/*.live.test.ts"],
    environment: "node",
  },
});
