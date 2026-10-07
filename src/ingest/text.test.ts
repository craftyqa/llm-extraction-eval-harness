import { describe, expect, it } from "vitest";
import { normaliseText } from "./text.ts";

describe("normaliseText", () => {
  it("strips a leading BOM", () => {
    expect(normaliseText("\uFEFFInvoice INV-001\n")).toBe("Invoice INV-001\n");
  });

  it("only strips a BOM at the start", () => {
    expect(normaliseText("a\uFEFFb")).toBe("a\uFEFFb");
  });

  it("converts CRLF and lone CR to LF", () => {
    expect(normaliseText("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });

  it("leaves other whitespace alone", () => {
    // Grounding collapses whitespace itself (SPEC §5); ingest must not.
    const text = "Total:\u00A01\u202F234,50 $\t\n";
    expect(normaliseText(text)).toBe(text);
  });
});
