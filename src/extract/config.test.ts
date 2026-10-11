import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_EXTRACT_OPTIONS, loadConfig } from "./config.ts";

const dir = mkdtempSync(join(tmpdir(), "config-test-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(name: string, config: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(config));
  return path;
}

describe("loadConfig", () => {
  it("loads config.default.json", () => {
    expect(loadConfig()).toEqual(DEFAULT_EXTRACT_OPTIONS);
  });

  it("rejects a chunk overlap of half the chunk size or more", () => {
    const path = writeConfig("overlap.json", {
      ...DEFAULT_EXTRACT_OPTIONS,
      retrievalOptions: { chunkSize: 300, chunkOverlap: 150, k: 2 },
    });
    expect(() => loadConfig(path)).toThrow(/chunkOverlap/u);
  });

  it("rejects unknown keys, so a typo can't be silently ignored", () => {
    const path = writeConfig("typo.json", {
      ...DEFAULT_EXTRACT_OPTIONS,
      retreival: false,
    });
    expect(() => loadConfig(path)).toThrow(/retreival/u);
  });
});
