import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPrompt, PASSAGE_SEPARATOR, renderDocument } from "./prompt.ts";

const promptsDir = join(import.meta.dirname, "../../prompts");

describe("loadPrompt", () => {
  it.each(readdirSync(promptsDir).map((f) => f.replace(/\.md$/u, "")))(
    "loads %s with LF line endings and a hash of that text",
    (id) => {
      const prompt = loadPrompt(id);
      expect(prompt.id).toBe(id);
      expect(prompt.text).not.toContain("\r");
      expect(prompt.hash).toBe(
        createHash("sha256").update(prompt.text).digest("hex"),
      );
    },
  );

  it("gives each version its own hash", () => {
    expect(loadPrompt("extract.v1").hash).not.toBe(
      loadPrompt("extract.v2").hash,
    );
  });

  it.each(["../package", "extract.v1/../../x", "Extract.V1", ""])(
    "refuses the id %j",
    (id) => {
      expect(() => loadPrompt(id)).toThrow(
        expect.objectContaining({
          name: "UsageError",
          code: "prompt_not_found",
        }),
      );
    },
  );

  it("throws a usage error for a missing prompt", () => {
    expect(() => loadPrompt("extract.v99")).toThrow(
      expect.objectContaining({ name: "UsageError", code: "prompt_not_found" }),
    );
  });
});

describe("renderDocument", () => {
  it("joins passages with the separator", () => {
    expect(renderDocument(["a", "b"])).toBe(
      `Document:\n\na${PASSAGE_SEPARATOR}b`,
    );
  });
});
