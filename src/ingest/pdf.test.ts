import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countUnmappedGlyphs,
  extractPdfText,
  hasTooManyUnmappedGlyphs,
} from "./pdf.ts";
import { pdfWithoutText } from "./test-fixtures.ts";

const examples = join(import.meta.dirname, "../../spec/examples");

const cases = [
  "01-classic",
  "02-service",
  "03-wholesale",
  "04-eu",
  "05-statement",
  "06-ambiguous-date",
  "07-account-statement",
];

function extract(caseDir: string) {
  return extractPdfText(readFileSync(join(examples, caseDir, "source.pdf")));
}

describe("extractPdfText", () => {
  it.each(cases)("%s matches source.mupdf.txt", (caseDir) => {
    const expected = readFileSync(
      join(examples, caseDir, "source.mupdf.txt"),
      "utf8",
    );
    const { text, pageCount } = extract(caseDir);
    expect(text).toBe(expected);
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });

  // Regression fixtures for decision #17: unpdf mis-mapped punctuation in these two
  it.each(["01-classic", "04-eu"])("%s has no unmapped glyphs", (caseDir) => {
    expect(countUnmappedGlyphs(extract(caseDir).text)).toBe(0);
  });

  it("returns no text for a PDF with no text layer", () => {
    expect(extractPdfText(pdfWithoutText())).toEqual({
      text: "",
      pageCount: 1,
    });
  });

  it("throws on a file that isn't a PDF", () => {
    expect(() =>
      extractPdfText(new TextEncoder().encode("not a pdf")),
    ).toThrow();
  });
});

describe("hasTooManyUnmappedGlyphs", () => {
  // Decision #45: the unpdf output for these two is the reason the threshold exists
  it.each(["01-classic", "04-eu"])(
    "rejects the unpdf text of %s",
    (caseDir) => {
      const text = readFileSync(
        join(examples, caseDir, "source.unpdf.txt"),
        "utf8",
      );
      expect(hasTooManyUnmappedGlyphs(text, countUnmappedGlyphs(text))).toBe(
        true,
      );
    },
  );

  it("allows up to 0.5% of non-whitespace characters", () => {
    const text = "x".repeat(1000);
    expect(hasTooManyUnmappedGlyphs(text, 5)).toBe(false);
    expect(hasTooManyUnmappedGlyphs(text, 6)).toBe(true);
  });

  it("ignores whitespace when counting characters", () => {
    expect(
      hasTooManyUnmappedGlyphs(`${"x".repeat(200)}${" ".repeat(800)}`, 2),
    ).toBe(true);
  });

  it("is false for text with no visible characters", () => {
    expect(hasTooManyUnmappedGlyphs(" \n", 0)).toBe(false);
  });
});

describe("countUnmappedGlyphs", () => {
  it("is 0 for ordinary text, accents and typographic punctuation", () => {
    expect(
      countUnmappedGlyphs("Facture n° 2026–04 · Montréal « TPS » 1 234,50 $"),
    ).toBe(0);
  });

  it("counts BMP Private Use Area characters", () => {
    expect(countUnmappedGlyphs("INV\uE0002026\uF8FF04817")).toBe(2);
  });

  it("counts supplementary Private Use Area characters once each", () => {
    expect(countUnmappedGlyphs("a\u{F0000}b\u{10FFFD}c")).toBe(2);
  });

  it("counts U+FFFD replacement characters", () => {
    expect(countUnmappedGlyphs("Total\uFFFD 100.00\uFFFD")).toBe(2);
  });
});
