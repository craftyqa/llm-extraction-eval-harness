import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const repo = join(import.meta.dirname, "..", "..");

/** Where golden cases live: the Phase 0 examples and the Phase 2 dataset. */
export const CASE_ROOTS = [
  join(repo, "spec", "examples"),
  join(repo, "data", "cases"),
];

export type CaseFiles = {
  /** Repo-relative directory, for messages. */
  name: string;
  dir: string;
  /** The document: `input.<pdf|csv|txt>` in `data/cases`, `source.pdf` in `spec/examples`. */
  inputPath: string;
  /** Parsed but unvalidated JSON. */
  expected: unknown;
  meta: unknown;
};

/** Every case directory (one holding an `expected.json`) under the case roots, sorted by path. */
export function listCases(roots: readonly string[] = CASE_ROOTS): CaseFiles[] {
  const cases: CaseFiles[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(root, d.name))
      .filter((dir) => existsSync(join(dir, "expected.json")))
      .sort();
    for (const dir of dirs) cases.push(readCase(dir));
  }
  return cases;
}

function readCase(dir: string): CaseFiles {
  const json = (name: string): unknown =>
    JSON.parse(readFileSync(join(dir, name), "utf8"));
  const inputs = readdirSync(dir).filter(
    (f) => /^input\.(pdf|csv|txt)$/u.test(f) || f === "source.pdf",
  );
  if (inputs.length !== 1) {
    throw new Error(
      `${dir}: expected one input file (input.<pdf|csv|txt> or source.pdf), found ${String(inputs.length)}`,
    );
  }
  return {
    name: relative(repo, dir).replaceAll("\\", "/"),
    dir,
    inputPath: join(dir, inputs[0] ?? ""),
    expected: json("expected.json"),
    meta: json("meta.json"),
  };
}
