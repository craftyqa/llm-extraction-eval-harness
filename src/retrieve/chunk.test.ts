import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Chunk, chunk } from "./chunk.ts";

const examples = join(import.meta.dirname, "../../spec/examples");

/** Every chunk is a slice of the source, within size, and consecutive chunks overlap by at most `overlap`. */
function expectValidChunks(
  text: string,
  chunks: Chunk[],
  size: number,
  overlap: number,
) {
  expect(chunks[0]?.start).toBe(0);
  expect(chunks.at(-1)?.end).toBe(text.length);
  chunks.forEach((c, i) => {
    expect(c.id).toBe(i);
    expect(c.text).toBe(text.slice(c.start, c.end));
    expect(c.end - c.start).toBeGreaterThan(0);
    expect(c.end - c.start).toBeLessThanOrEqual(size);
    const next = chunks[i + 1];
    if (next !== undefined) {
      expect(next.start).toBeGreaterThan(c.start);
      expect(next.start).toBeLessThanOrEqual(c.end);
      expect(c.end - next.start).toBeLessThanOrEqual(overlap);
    }
  });
}

describe("chunk", () => {
  it("returns no chunks for empty text", () => {
    expect(chunk("")).toEqual([]);
  });

  it("returns one chunk when the text fits", () => {
    expect(chunk("Invoice INV-001\nTotal: 10.00\n")).toEqual([
      { id: 0, start: 0, end: 29, text: "Invoice INV-001\nTotal: 10.00\n" },
    ]);
  });

  it("cuts at a paragraph break before a line break", () => {
    const text = "aaaaaaaaaaa\n\nbbbb\ncc\ndddddddd";
    const [first] = chunk(text, { size: 20, overlap: 0 });
    expect(first?.text).toBe("aaaaaaaaaaa\n\n");
  });

  it("ignores a paragraph break in the first half of the chunk", () => {
    const text = "aa\n\nbbbbbbbbbb\ncccccccccccccccccccc";
    const [first] = chunk(text, { size: 20, overlap: 0 });
    expect(first?.text).toBe("aa\n\nbbbbbbbbbb\n");
  });

  it("falls back to a word break, then a hard cut", () => {
    expect(
      chunk("aaaaaaaaaaaa bbbbbbbbbbbb", { size: 20, overlap: 0 })[0]?.text,
    ).toBe("aaaaaaaaaaaa ");
    expect(
      chunk("x".repeat(25), { size: 10, overlap: 0 }).map((c) => c.text),
    ).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("starts the overlap at a line start", () => {
    const text =
      "line one is here\nline two is here\nline three is here\nline four\n";
    const chunks = chunk(text, { size: 40, overlap: 18 });
    expect(chunks[1]?.text.startsWith("line two is here\n")).toBe(true);
    expectValidChunks(text, chunks, 40, 18);
  });

  it("starts the overlap at a word start when there's no line break", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const chunks = chunk(text, { size: 30, overlap: 10 });
    expectValidChunks(text, chunks, 30, 10);
    for (const c of chunks.slice(1)) {
      expect(text.charAt(c.start - 1)).toBe(" ");
    }
  });

  it("doesn't split a surrogate pair at a hard cut", () => {
    const text = "x".repeat(9) + "😀".repeat(10);
    const chunks = chunk(text, { size: 10, overlap: 0 });
    expectValidChunks(text, chunks, 10, 0);
    for (const c of chunks) {
      expect(c.text.isWellFormed()).toBe(true);
    }
  });

  it("rejects an overlap of half the size or more", () => {
    expect(() => chunk("text", { size: 10, overlap: 5 })).toThrow(RangeError);
    expect(() => chunk("text", { size: 0, overlap: 0 })).toThrow(RangeError);
  });

  it.each([
    "01-classic",
    "02-service",
    "03-wholesale",
    "04-eu",
    "05-statement",
    "06-ambiguous-date",
    "07-account-statement",
  ])("chunks %s with the default options", (caseDir) => {
    const text = readFileSync(
      join(examples, caseDir, "source.mupdf.txt"),
      "utf8",
    );
    const chunks = chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    expectValidChunks(text, chunks, 800, 100);
  });
});
