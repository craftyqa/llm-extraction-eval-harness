import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CaseMeta,
  computeCoverage,
  parseRisks,
  renderCoverage,
} from "./coverage.ts";

const R1 = { id: "R-1", severity: "S1", title: "Wrong total" };
const R2 = { id: "R-2", severity: "S1", title: "Remit-to taken as vendor" };
const risks = [R1, R2];

const meta = (
  id: string,
  partition: string,
  riskIds: string[],
  extra: Partial<CaseMeta> = {},
): CaseMeta => ({
  id,
  partition,
  risks: riskIds,
  smoke: false,
  reviewedBy: null,
  ...extra,
});

/** Three cases in each Phase 2 partition, all tagged R-1. */
const fullDataset = [
  "clean",
  "missing fields",
  "conflicting values",
  "decoys",
  "messy formatting",
  "boundary (cross-field)",
  "should-reject",
].flatMap((p, i) =>
  [0, 1, 2].map((j) =>
    meta(`CASE-${String(i * 3 + j).padStart(4, "0")}`, p, ["R-1"]),
  ),
);

describe("parseRisks", () => {
  it("reads id, severity and a short title from spec/risks.md", () => {
    const parsed = parseRisks(
      readFileSync(join(import.meta.dirname, "../../spec/risks.md"), "utf8"),
    );
    expect(parsed.map((r) => r.id)).toEqual(
      Array.from({ length: 14 }, (_, i) => `R-${String(i + 1)}`),
    );
    expect(parsed[0]).toEqual({
      id: "R-1",
      severity: "S1",
      title: "Wrong total",
    });
    expect(parsed.find((r) => r.id === "R-13")?.severity).toBe("S3");
  });

  it("skips the coverage table's rows, which have no severity column", () => {
    const parsed = parseRisks(
      "| R-1 | Wrong total | total | S1 | x |\n| R-1 | EX-01, EX-02 | — |\n",
    );
    expect(parsed).toHaveLength(1);
  });
});

describe("computeCoverage", () => {
  it("passes when every risk has a case and every partition has 3", () => {
    const coverage = computeCoverage(
      [...fullDataset, meta("CASE-0100", "decoys", ["R-2"])],
      risks,
    );
    expect(coverage.failures).toEqual([]);
  });

  it("fails for a risk with no case", () => {
    expect(computeCoverage(fullDataset, risks).failures).toEqual([
      "R-2 (S1) has no case",
    ]);
  });

  it("fails for a partition with fewer than 3 cases", () => {
    const short = fullDataset.filter((c) => c.id !== "CASE-0000");
    expect(computeCoverage(short, [R1]).failures).toEqual([
      'partition "clean" has 2 of at least 3 cases',
    ]);
  });

  it("doesn't require the adversarial partition, but reports it once used", () => {
    const base = computeCoverage(fullDataset, [R1]);
    expect(base.partitions.map((p) => p.name)).not.toContain("adversarial");
    const withAttack = computeCoverage(
      [...fullDataset, meta("CASE-0200", "adversarial", ["R-1"])],
      [R1],
    );
    expect(
      withAttack.partitions.find((p) => p.name === "adversarial"),
    ).toMatchObject({ target: null });
    expect(withAttack.failures).toEqual([]);
  });

  it("never counts the dev examples", () => {
    const coverage = computeCoverage(fullDataset, risks, [
      meta("EX-03", "decoys", ["R-2"]),
    ]);
    expect(coverage.failures).toEqual(["R-2 (S1) has no case"]);
    expect(coverage.risks[1]).toMatchObject({ cases: [], examples: ["EX-03"] });
  });

  it("counts smoke and reviewed cases, and fills the risk × partition matrix", () => {
    const cases = [
      meta("CASE-0001", "clean", ["R-1"], { smoke: true, reviewedBy: "jen" }),
      meta("CASE-0002", "decoys", ["R-1", "R-2"]),
    ];
    const coverage = computeCoverage(cases, risks);
    expect(coverage).toMatchObject({ cases: 2, reviewed: 1, smoke: 1 });
    expect(coverage.risks[0]).toMatchObject({
      cases: ["CASE-0001", "CASE-0002"],
      smoke: ["CASE-0001"],
    });
    expect(coverage.matrix["R-2"]).toMatchObject({ clean: 0, decoys: 1 });
  });
});

describe("renderCoverage", () => {
  it("states the status and lists the failures", () => {
    const md = renderCoverage(computeCoverage(fullDataset, risks));
    expect(md).toContain("**Status: FAIL.**");
    expect(md).toContain("- R-2 (S1) has no case");
    expect(md).toContain("| R-2 | S1 | Remit-to taken as vendor | **0**: — |");
  });

  it("is deterministic", () => {
    const coverage = computeCoverage(fullDataset, risks);
    expect(renderCoverage(coverage)).toBe(renderCoverage(coverage));
  });
});
