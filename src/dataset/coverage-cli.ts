import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASE_ROOTS, listCases } from "./cases.ts";
import { computeCoverage, parseRisks, renderCoverage } from "./coverage.ts";
import { metaSchema } from "./schema.ts";

/**
 * `npm run coverage-matrix`: writes `spec/coverage-matrix.md` and exits 1 when
 * a risk has no case or a partition has too few (docs/specs.md, Phase 2).
 */
const [examplesRoot = "", casesRoot = ""] = CASE_ROOTS;
const specDir = join(import.meta.dirname, "..", "..", "spec");
const metas = (root: string) =>
  listCases([root]).map((c) => {
    const meta = metaSchema.safeParse(c.meta);
    if (!meta.success)
      throw new Error(
        `${c.name}/meta.json is invalid; run npm test for details`,
      );
    return meta.data;
  });

const coverage = computeCoverage(
  metas(casesRoot),
  parseRisks(readFileSync(join(specDir, "risks.md"), "utf8")),
  metas(examplesRoot),
);
writeFileSync(join(specDir, "coverage-matrix.md"), renderCoverage(coverage));

if (coverage.failures.length === 0) {
  process.stderr.write(
    `coverage: PASS (${String(coverage.cases)} cases) → spec/coverage-matrix.md\n`,
  );
} else {
  process.stderr.write(
    `coverage: FAIL (${String(coverage.cases)} cases) → spec/coverage-matrix.md\n` +
      coverage.failures.map((f) => `  ${f}\n`).join(""),
  );
  process.exitCode = 1;
}
