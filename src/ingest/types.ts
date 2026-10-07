export type SourceType = "pdf" | "csv" | "txt";

/** Rejects that ingest decides without a model call. See SPEC §7 for the conditions and their precedence. */
export type IngestRejectReason = "empty" | "too_large" | "unreadable";

export type IngestedSource = {
  /** The text every later stage uses. Evidence offsets index into this exact string. */
  text: string;
  sourceType: SourceType;
  /** PDFs only. */
  pageCount?: number;
  /** File size on disk. */
  bytes: number;
  /** Private Use Area and U+FFFD characters in `text` (decision #19). */
  unmappedGlyphs: number;
};

export type IngestResult =
  | { status: "ok"; source: IngestedSource }
  | { status: "rejected"; reason: IngestRejectReason; bytes: number };
