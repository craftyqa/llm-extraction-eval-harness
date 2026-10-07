import type { IngestResult } from "./types.ts";

/**
 * Reads a PDF, CSV or text file and returns its text plus source metadata,
 * or an `empty` / `too_large` / `unreadable` reject (SPEC §7).
 *
 * TODO:
 * - Pick the parser from the file extension: pdf.ts, csv.ts, text.ts.
 * - The 5 MB size limit (SPEC §7). Decide whether that's 5,000,000 or 5 × 1024 × 1024 bytes.
 * - The unmapped-glyph reject threshold (decision #19; SPEC §13 open question).
 * - Apply rejects in SPEC §7 precedence order.
 * - What to do with an unsupported extension or a missing file (CLI exit code 1 = error).
 */
export function ingest(_path: string): Promise<IngestResult> {
  throw new Error("Not implemented: ingest");
}
