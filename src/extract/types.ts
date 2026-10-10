import type { IngestedSource } from "../ingest/types.ts";
import type { InvoiceFields } from "./fields.ts";

/** SPEC §5 output contract. */
export type Evidence = {
  raw: string;
  quote: string;
  start: number | null;
  end: number | null;
  grounded: boolean;
};

export type NotFoundReason =
  "absent" | "ambiguous" | "conflicting" | "unparseable";

export type FieldResult<T> =
  | { status: "found"; value: T; evidence: Evidence[] }
  | { status: "not_found"; reason?: NotFoundReason };

export type RejectReason =
  | "empty"
  | "too_large"
  | "unreadable"
  | "unsupported_language"
  | "out_of_scope"
  | "multiple_documents";

export type ExtractedFields = {
  [K in keyof InvoiceFields]: FieldResult<InvoiceFields[K]>;
};

export type ExtractionResult =
  | { status: "extracted"; fields: ExtractedFields; meta: RunMeta }
  | { status: "rejected"; reason: RejectReason; meta: RunMeta };

/** Ollama options, fixed and recorded in every result (docs/specs.md, Stack and setup). */
export type ModelOptions = {
  temperature: number;
  seed: number;
  num_ctx: number;
  num_predict: number;
};

/** The versioning fields from docs/specs.md (Versioning and reproducibility), plus per-run measurements. */
export type RunMeta = {
  /** `package.json` version + git short SHA, `-dirty` if the tree has changes. */
  appVersion: string;
  model: string;
  /** From Ollama `/api/tags`; `null` when the run rejected before any model call. */
  modelDigest: string | null;
  promptId: string;
  /** SHA-256 of the prompt file. */
  promptHash: string;
  options: ModelOptions;
  retrieval: boolean;
  hardware: string;
  /** Schema-validation retries (0 or 1). */
  retries: number;
  /** Wall time for the whole extraction. */
  latencyMs: number;
  /** Summed over attempts; 0 when there was no model call. */
  promptTokens: number;
  completionTokens: number;
  /** Ingest metadata; absent when ingest rejected the file. */
  source?: Omit<IngestedSource, "text">;
};
