import { defineConfig } from "vitest/config";

// Live integration tests: need Ollama running with the model pulled.
// Plumbing, not quality. One model call at a time, so files run in sequence.
export default defineConfig({
  test: {
    include: ["**/*.live.test.ts"],
    exclude: ["node_modules/**", "reports/**"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 30_000,
  },
});
