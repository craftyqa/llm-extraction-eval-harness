import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collapseWhitespace, groundEvidence } from "./grounding.ts";

const examples = join(import.meta.dirname, "../../spec/examples");
const NNBSP = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);

function ground(raw: string, quote: string, source: string) {
  return groundEvidence(raw, quote, collapseWhitespace(source));
}

describe("collapseWhitespace", () => {
  it("collapses every whitespace run to one space and maps offsets back", () => {
    const source = `a \n\t b${NBSP}c`;
    const collapsed = collapseWhitespace(source);
    expect(collapsed.text).toBe("a b c");
    expect(collapsed.starts).toEqual([0, 1, 5, 6, 7]);
    expect(collapsed.ends).toEqual([1, 5, 6, 7, 8]);
  });
});

describe("groundEvidence", () => {
  it("grounds a quote and returns its offsets", () => {
    const source = "Invoice No. INV-001\nTotal: 10.00\n";
    const evidence = ground("INV-001", "Invoice No. INV-001", source);
    expect(evidence).toEqual({
      raw: "INV-001",
      quote: "Invoice No. INV-001",
      start: 0,
      end: 19,
      grounded: true,
    });
  });

  it.each([
    ["", "Total 10.00"],
    ["10.00", ""],
    ["  ", "Total 10.00"],
    ["10.00", " \n "],
  ])("never grounds empty or blank evidence (%j, %j)", (raw, quote) => {
    expect(ground(raw, quote, "Total 10.00")).toMatchObject({
      start: null,
      end: null,
      grounded: false,
    });
  });

  it("matches a quote across a line break and returns the original span", () => {
    const source = "Bill To:\nSaltmarsh\n  Provisions Inc.\n";
    const evidence = ground(
      "Saltmarsh Provisions Inc.",
      "Saltmarsh Provisions Inc.",
      source,
    );
    expect(evidence.grounded).toBe(true);
    expect(source.slice(evidence.start ?? 0, evidence.end ?? 0)).toBe(
      "Saltmarsh\n  Provisions Inc.",
    );
  });

  it("matches U+202F in the source against a space in the quote", () => {
    const source = `TOTAL 2${NNBSP}546,00 $`;
    const evidence = ground("2 546,00 $", "TOTAL 2 546,00 $", source);
    expect(evidence).toMatchObject({
      start: 0,
      end: source.length,
      grounded: true,
    });
  });

  it("counts offsets in UTF-16 code units after an astral character", () => {
    const source = "😀 Invoice INV-9";
    const evidence = ground("INV-9", "INV-9", source);
    expect(evidence).toMatchObject({ start: 11, end: 16, grounded: true });
    expect(source.slice(11, 16)).toBe("INV-9");
  });

  it("uses the first match of a repeated quote", () => {
    const source = "Total 10.00\nRemittance\nTotal 10.00\n";
    expect(ground("10.00", "Total 10.00", source)).toMatchObject({
      start: 0,
      end: 11,
    });
  });

  it("keeps offsets but doesn't ground when raw isn't in the quote", () => {
    const source = "Invoice No. INV-001\n";
    expect(ground("INV-002", "Invoice No. INV-001", source)).toMatchObject({
      start: 0,
      end: 19,
      grounded: false,
    });
  });

  it("is case-sensitive", () => {
    expect(
      ground("inv-001", "invoice no. inv-001", "Invoice No. INV-001"),
    ).toMatchObject({
      start: null,
      grounded: false,
    });
  });
});

type Expected = {
  fields?: Record<string, { evidence?: { raw: string; quote: string }[] }>;
};

describe("expected quotes in spec/examples", () => {
  const cases = readdirSync(examples, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  it.each(cases)("%s: every expected quote grounds", (caseDir) => {
    const source = readFileSync(
      join(examples, caseDir, "source.mupdf.txt"),
      "utf8",
    );
    const expected = JSON.parse(
      readFileSync(join(examples, caseDir, "expected.json"), "utf8"),
    ) as Expected;
    const collapsed = collapseWhitespace(source);
    for (const field of Object.values(expected.fields ?? {})) {
      for (const { raw, quote } of field.evidence ?? []) {
        const evidence = groundEvidence(raw, quote, collapsed);
        expect(evidence, `${raw} / ${quote}`).toMatchObject({ grounded: true });
        const span = source.slice(evidence.start ?? 0, evidence.end ?? 0);
        expect(collapseWhitespace(span).text).toBe(
          collapseWhitespace(quote).text,
        );
      }
    }
  });
});
