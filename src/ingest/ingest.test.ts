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

  it("rejects a file over 5 MB as too_large", async () => {
    // 6 MB stays clear of the 5,000,000 vs 5 MiB question
    const path = writeTemp("huge.txt", "a".repeat(6 * 1024 * 1024));
    expect(await ingest(path)).toMatchObject({
      status: "rejected",
      reason: "too_large",
    });
  });

  it.todo("rejects a PDF with no text layer as unreadable (needs a fixture)");
  it.todo("rejects a PDF over the unmapped-glyph threshold as unreadable");
  it.todo("unsupported extension");
  it.todo("missing file");
});
