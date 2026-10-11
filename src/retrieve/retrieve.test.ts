import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXTRACT_OPTIONS } from "../extract/config.ts";
import { type Chunk, chunk } from "./chunk.ts";
import { retrieve, tokenize } from "./retrieve.ts";

const examples = join(import.meta.dirname, "../../spec/examples");

/** Chunks for a list of blocks, each block its own chunk. */
function chunksOf(blocks: string[]): { source: string; chunks: Chunk[] } {
  const chunks: Chunk[] = [];
  let start = 0;
  for (const text of blocks) {
    chunks.push({ id: chunks.length, start, end: start + text.length, text });
    start += text.length;
  }
  return { source: blocks.join(""), chunks };
}

describe("tokenize", () => {
  it("lowercases, strips accents and splits on punctuation", () => {
    expect(tokenize("Montant dû: 1 234,50 $ — Échéance")).toEqual([
      "montant",
      "du",
      "1",
      "234",
      "50",
      "echeance",
    ]);
  });

  it("keeps letters and digits together", () => {
    expect(tokenize("GST # 70219 8841 RT0001")).toEqual([
      "gst",
      "70219",
      "8841",
      "rt0001",
    ]);
  });
});

describe("retrieve", () => {
  const { source, chunks } = chunksOf([
    "ACME SUPPLY LTD.\nInvoice No. INV-001\n",
    "Widgets 10 x 5.00 50.00\nBolts 2 x 1.00 2.00\n",
    "Subtotal 52.00\nGST 2.60\nTotal 54.60\n",
    "Previous balance 10.00\nAmount Due 64.60\n",
  ]);

  it("ranks the chunk with the field's label first", () => {
    const { byField } = retrieve(source, chunks, { k: 3 });
    expect(byField.amountDue[0]).toBe(3);
    expect(byField.taxAmount[0]).toBe(2);
    expect(byField.invoiceNumber[0]).toBe(0);
  });

  it("only returns chunks that match the field", () => {
    const { byField } = retrieve(source, chunks, { k: 3 });
    expect(byField.taxAmount).toEqual([2]);
    expect(byField.customerName).toEqual([]);
  });

  it("returns at most k chunks per field", () => {
    const { byField } = retrieve(source, chunks, { k: 1 });
    for (const ids of Object.values(byField)) {
      expect(ids.length).toBeLessThanOrEqual(1);
    }
  });

  it("breaks ties by document order", () => {
    const tied = chunksOf(["Total 1.00\n", "Total 2.00\n", "Total 3.00\n"]);
    const { byField } = retrieve(tied.source, tied.chunks, { k: 2 });
    expect(byField.total).toEqual([0, 1]);
  });

  it("always retrieves the first chunk", () => {
    const blocks = chunksOf(["STATEMENT OF ACCOUNT\n", "Amount Due 64.60\n"]);
    const { chunkIds } = retrieve(blocks.source, blocks.chunks, { k: 1 });
    expect(chunkIds).toEqual([0, 1]);
  });

  it("skips chunks no field matches", () => {
    const { chunkIds, passages } = retrieve(source, chunks, { k: 3 });
    expect(chunkIds).toEqual([0, 2, 3]);
    expect(passages).toEqual([
      { start: 0, end: 37, text: chunks[0]?.text },
      {
        start: 81,
        end: source.length,
        text: source.slice(81),
      },
    ]);
  });

  it("merges overlapping chunks into one passage without repeating text", () => {
    const text = "Invoice No. INV-001\nTotal 54.60\nAmount Due 64.60\n";
    const overlapping: Chunk[] = [
      { id: 0, start: 0, end: 32, text: text.slice(0, 32) },
      { id: 1, start: 20, end: text.length, text: text.slice(20) },
    ];
    expect(retrieve(text, overlapping, { k: 3 }).passages).toEqual([
      { start: 0, end: text.length, text },
    ]);
  });

  it("returns nothing for no chunks", () => {
    expect(retrieve("", [], { k: 3 })).toMatchObject({
      chunkIds: [],
      passages: [],
    });
  });
});

type Expected = {
  status: string;
  fields?: Record<string, { evidence?: { quote: string }[] }>;
};

const collapse = (s: string) => s.replace(/\s+/gu, " ");

// With the configured options (decision #55) retrieval keeps about 85% of the
// examples' text; every expected quote must still be in a passage.
describe("retrieval recall on spec/examples", () => {
  it.each([
    "01-classic",
    "02-service",
    "03-wholesale",
    "05-statement",
    "06-ambiguous-date",
  ])("%s: every expected quote is in a retrieved passage", (caseDir) => {
    const source = readFileSync(
      join(examples, caseDir, "source.mupdf.txt"),
      "utf8",
    );
    const expected = JSON.parse(
      readFileSync(join(examples, caseDir, "expected.json"), "utf8"),
    ) as Expected;
    const { chunkSize, chunkOverlap, k } =
      DEFAULT_EXTRACT_OPTIONS.retrievalOptions;
    const chunks = chunk(source, { size: chunkSize, overlap: chunkOverlap });
    const passages = retrieve(source, chunks, { k }).passages.map((p) =>
      collapse(p.text),
    );
    // Retrieval must actually drop something, or it's whole-document mode
    expect(passages.join("").length).toBeLessThan(collapse(source).length);
    const quotes = Object.values(expected.fields ?? {}).flatMap((f) =>
      (f.evidence ?? []).map((e) => collapse(e.quote)),
    );
    expect(quotes.length).toBeGreaterThan(0);
    const missed = quotes.filter((q) => !passages.some((p) => p.includes(q)));
    expect(missed).toEqual([]);
  });
});
