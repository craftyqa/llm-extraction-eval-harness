import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ingest } from "./ingest.ts";
import { pdfWithoutText } from "./test-fixtures.ts";

const examples = join(import.meta.dirname, "../../spec/examples");
const dir = mkdtempSync(join(tmpdir(), "ingest-test-"));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeTemp(name: string, content: string | Uint8Array): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("ingest", () => {
  it("reads a PDF", async () => {
    const path = join(examples, "01-classic", "source.pdf");
    const result = await ingest(path);
    expect(result).toEqual({
      status: "ok",
      source: {
        text: readFileSync(
          join(examples, "01-classic", "source.mupdf.txt"),
          "utf8",
        ),
        sourceType: "pdf",
        pageCount: expect.any(Number) as number,
        bytes: statSync(path).size,
        unmappedGlyphs: 0,
      },
    });
  });

  it("reads a text file, normalised", async () => {
    const path = writeTemp(
      "invoice.txt",
      "\uFEFFInvoice INV-001\r\nTotal: 10.00\r\n",
    );
    const result = await ingest(path);
    expect(result).toEqual({
      status: "ok",
      source: {
        text: "Invoice INV-001\nTotal: 10.00\n",
        sourceType: "txt",
        bytes: statSync(path).size,
        unmappedGlyphs: 0,
      },
    });
  });

  it("reads a CSV as header: value text", async () => {
    const path = writeTemp(
      "invoice.csv",
      "Invoice Number,Total\nINV-1001,1130.00\n",
    );
    const result = await ingest(path);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.source.sourceType).toBe("csv");
    expect(result.source.text).toContain("Invoice Number: INV-1001");
    expect(result.source).not.toHaveProperty("pageCount");
  });

  it("rejects whitespace-only text as empty", async () => {
    const path = writeTemp("blank.txt", " \r\n\t\n\u00A0");
    expect(await ingest(path)).toEqual({
      status: "rejected",
      reason: "empty",
      bytes: statSync(path).size,
    });
  });

  it("reads a CSV with a BOM and CRLF line endings", async () => {
    const path = writeTemp(
      "bom.csv",
      "\uFEFFInvoice Number,Total\r\nINV-1001,1130.00\r\n",
    );
    expect(await ingest(path)).toMatchObject({
      status: "ok",
      source: { text: "Invoice Number: INV-1001\nTotal: 1130.00\n" },
    });
  });

  it("reads a .PDF extension in capitals", async () => {
    const path = writeTemp(
      "INVOICE.PDF",
      readFileSync(join(examples, "01-classic", "source.pdf")),
    );
    expect(await ingest(path)).toMatchObject({
      status: "ok",
      source: { sourceType: "pdf" },
    });
  });

  it("records unmapped glyphs in a text file without rejecting it", async () => {
    const path = writeTemp("icons.txt", "\uE000 Phone\n\uE001 Email\n");
    expect(await ingest(path)).toMatchObject({
      status: "ok",
      source: { unmappedGlyphs: 2 },
    });
  });

  describe("too_large (decision #37)", () => {
    it("accepts exactly 5,000,000 bytes", async () => {
      const path = writeTemp("limit.txt", "a".repeat(5_000_000));
      expect(await ingest(path)).toMatchObject({ status: "ok" });
    });

    it("rejects 5,000,001 bytes", async () => {
      const path = writeTemp("over.txt", "a".repeat(5_000_001));
      expect(await ingest(path)).toEqual({
        status: "rejected",
        reason: "too_large",
        bytes: 5_000_001,
      });
    });

    it("rejects an oversized PDF without parsing it", async () => {
      const path = writeTemp("huge.pdf", "x".repeat(5_000_001));
      expect(await ingest(path)).toMatchObject({ reason: "too_large" });
    });
  });

  describe("empty", () => {
    it("rejects a header-only CSV", async () => {
      const path = writeTemp("header.csv", "Invoice Number,Total\n");
      expect(await ingest(path)).toMatchObject({ reason: "empty" });
    });

    it("rejects a whitespace-only CSV", async () => {
      const path = writeTemp("blank.csv", "  \r\n\t\r\n");
      expect(await ingest(path)).toMatchObject({ reason: "empty" });
    });
  });

  describe("unreadable", () => {
    it("rejects invalid UTF-8", async () => {
      const path = writeTemp(
        "latin1.csv",
        new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x0a]), // "Café" in Windows-1252
      );
      expect(await ingest(path)).toMatchObject({ reason: "unreadable" });
    });

    it("rejects a NUL character", async () => {
      const path = writeTemp("binary.txt", "Invoice\u0000INV-001\n");
      expect(await ingest(path)).toMatchObject({ reason: "unreadable" });
    });

    it("rejects a CSV it can't parse", async () => {
      const path = writeTemp("broken.csv", 'Item,Amount\n"Widgets,100.00\n');
      expect(await ingest(path)).toMatchObject({ reason: "unreadable" });
    });

    it("rejects a PDF with no text layer (decision #45)", async () => {
      const path = writeTemp("scan.pdf", pdfWithoutText());
      expect(await ingest(path)).toEqual({
        status: "rejected",
        reason: "unreadable",
        bytes: statSync(path).size,
      });
    });

    it("rejects a .pdf that isn't a PDF", async () => {
      const path = writeTemp("fake.pdf", "Invoice INV-001\n");
      expect(await ingest(path)).toMatchObject({ reason: "unreadable" });
    });
  });

  describe("precedence: empty > too_large > unreadable (SPEC §7)", () => {
    it("rejects a 6 MB whitespace-only file as empty", async () => {
      const path = writeTemp("huge-blank.txt", " \n".repeat(3_000_000));
      expect(await ingest(path)).toMatchObject({ reason: "empty" });
    });

    it("rejects an oversized binary file as too_large", async () => {
      const path = writeTemp("huge-binary.txt", "\u0000".repeat(5_000_001));
      expect(await ingest(path)).toMatchObject({ reason: "too_large" });
    });
  });

  describe("usage errors (decision #47)", () => {
    it("throws for an unsupported extension", async () => {
      const path = writeTemp("invoice.docx", "Invoice INV-001\n");
      await expect(ingest(path)).rejects.toMatchObject({
        name: "UsageError",
        code: "unsupported_extension",
      });
    });

    it("throws for a missing file", async () => {
      await expect(ingest(join(dir, "missing.pdf"))).rejects.toMatchObject({
        name: "UsageError",
        code: "file_not_found",
      });
    });
  });
});
