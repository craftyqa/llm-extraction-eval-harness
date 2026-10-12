import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES } from "./cases.ts";
import { caseFiles, generateCase } from "./generate.ts";

const casesDir = join(import.meta.dirname, "..", "cases");

describe("generated cases in data/cases", () => {
  it("case ids are unique", () => {
    const ids = CASES.map((c) => c.info.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A generator change must not silently change a reviewed case: regenerate
  // on purpose (`npm run generate:cases -- --only <id> --force`) or, for a
  // hand-edited case, remove it from cases.ts.
  it.each(CASES.map((c) => [c.info.id, c] as const))(
    "%s matches its generator spec byte for byte",
    async (id, spec) => {
      const generated = await generateCase(spec.seed, spec.options, spec.info);
      for (const [name, data] of Object.entries(caseFiles(generated))) {
        const path = join(casesDir, id, name);
        expect(existsSync(path), path).toBe(true);
        if (name === "meta.json") continue;
        expect(
          Buffer.from(readFileSync(path)).equals(Buffer.from(data)),
          path,
        ).toBe(true);
      }
      // Review sets these by hand; everything else is the generator's
      const meta = JSON.parse(
        readFileSync(join(casesDir, id, "meta.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(meta).toEqual({
        ...generated.meta,
        smoke: meta.smoke,
        reviewedBy: meta.reviewedBy,
        reviewedAt: meta.reviewedAt,
      });
    },
  );
});
