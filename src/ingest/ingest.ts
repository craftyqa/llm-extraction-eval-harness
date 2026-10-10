import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { csvToText } from "./csv.ts";
import {
  countUnmappedGlyphs,
  extractPdfText,
  hasTooManyUnmappedGlyphs,
  type PdfText,
} from "./pdf.ts";
import { normaliseText } from "./text.ts";
import type { IngestRejectReason, IngestResult, SourceType } from "./types.ts";

/** Files above this size are `too_large`; exactly this size is accepted (decision #37). */
export const MAX_BYTES = 5_000_000;

/** The file can't be ingested at all: not a reject, a CLI exit code 1 (decision #47). */
export class UsageError extends Error {
  constructor(
    message: string,
    readonly code:
      "unsupported_extension" | "file_not_found" | "prompt_not_found",
  ) {
    super(message);
    this.name = "UsageError";
  }
}

const sourceTypes: Partial<Record<string, SourceType>> = {
  ".pdf": "pdf",
  ".csv": "csv",
  ".txt": "txt",
};

/**
 * Reads a PDF, CSV or text file and returns its text plus source metadata,
 * or an `empty` / `too_large` / `unreadable` reject (SPEC §7).
 * Throws `UsageError` for an unsupported extension or a missing file.
 */
export async function ingest(path: string): Promise<IngestResult> {
  const sourceType = sourceTypes[extname(path).toLowerCase()];
  if (sourceType === undefined) {
    throw new UsageError(
      `Unsupported file type: ${path} (expected .pdf, .csv or .txt)`,
      "unsupported_extension",
    );
  }

  let data: Buffer;
  try {
    data = await readFile(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new UsageError(`File not found: ${path}`, "file_not_found");
    }
    throw error;
  }

  return sourceType === "pdf" ? ingestPdf(data) : ingestText(data, sourceType);
}

function ingestPdf(data: Uint8Array): IngestResult {
  const bytes = data.byteLength;
  // A PDF is never `empty` (SPEC §7), so a large one is rejected without parsing.
  if (bytes > MAX_BYTES) return reject("too_large", bytes);

  let pdf: PdfText;
  try {
    pdf = extractPdfText(data);
  } catch {
    return reject("unreadable", bytes);
  }
  const unmappedGlyphs = countUnmappedGlyphs(pdf.text);
  if (isBlank(pdf.text) || hasTooManyUnmappedGlyphs(pdf.text, unmappedGlyphs)) {
    return reject("unreadable", bytes);
  }
  return {
    status: "ok",
    source: {
      text: pdf.text,
      sourceType: "pdf",
      pageCount: pdf.pageCount,
      bytes,
      unmappedGlyphs,
    },
  };
}

function ingestText(data: Uint8Array, sourceType: "csv" | "txt"): IngestResult {
  const bytes = data.byteLength;
  const text = readText(data, sourceType);

  // SPEC §7 precedence: empty > too_large > unreadable
  if (text !== undefined && isBlank(text)) return reject("empty", bytes);
  if (bytes > MAX_BYTES) return reject("too_large", bytes);
  if (text === undefined) return reject("unreadable", bytes);

  return {
    status: "ok",
    source: {
      text,
      sourceType,
      bytes,
      unmappedGlyphs: countUnmappedGlyphs(text),
    },
  };
}

/** The ingested text, or `undefined` if the file is binary or the CSV can't be parsed. */
function readText(
  data: Uint8Array,
  sourceType: "csv" | "txt",
): string | undefined {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(data);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) return undefined;

  const text = normaliseText(decoded);
  if (sourceType === "txt") return text;
  try {
    return csvToText(text);
  } catch {
    return undefined;
  }
}

function isBlank(text: string): boolean {
  return /^\s*$/u.test(text);
}

function reject(reason: IngestRejectReason, bytes: number): IngestResult {
  return { status: "rejected", reason, bytes };
}
