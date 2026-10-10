import { ingest } from "../ingest/ingest.ts";
import type { IngestedSource } from "../ingest/types.ts";
import { chunk } from "../retrieve/chunk.ts";
import { retrieve } from "../retrieve/retrieve.ts";
import { FIELD_KINDS, FIELD_NAMES, type FieldName } from "./fields.ts";
import {
  collapseWhitespace,
  groundEvidence,
  type CollapsedText,
} from "./grounding.ts";
import { appVersion, hardwareProfile } from "./meta.ts";
import { formatCents, normalise, toCents } from "./normalise.ts";
import type { ChatMessage, ModelClient } from "./ollama.ts";
import { loadPrompt, renderDocument, type Prompt } from "./prompt.ts";
import {
  type ModelField,
  type ModelOutput,
  modelOutputJsonSchema,
  parseModelOutput,
} from "./schema.ts";
import type {
  ExtractedFields,
  ExtractionResult,
  FieldResult,
  ModelOptions,
  RejectReason,
  RunMeta,
} from "./types.ts";

export type ExtractOptions = {
  model: string;
  promptId: string;
  /** `false` sends the whole document (`--no-retrieval`). */
  retrieval: boolean;
  options: ModelOptions;
};

/** Defaults; the CLI layers env vars and flags on top. Temperature 0.2 is still proposed (docs/specs.md). */
export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
  model: "qwen2.5:7b-instruct",
  promptId: "extract.v1",
  retrieval: true,
  options: { temperature: 0.2, seed: 42, num_ctx: 8192, num_predict: 2048 },
};

/** Conservative characters-per-token estimate for the `too_large` pre-check (decision #49). */
export const CHARS_PER_TOKEN = 3;

/** At most one retry on a schema-validation failure (docs/specs.md, Retry policy). */
const MAX_ATTEMPTS = 2;

/**
 * The model's output was still schema-invalid after the retry: graded as
 * `malformed` (SPEC §10). Carries the run metadata and the last attempt.
 */
export class MalformedOutputError extends Error {
  constructor(
    readonly validationError: string,
    readonly lastOutput: string,
    readonly meta: RunMeta,
  ) {
    super(`Model output is schema-invalid after retry: ${validationError}`);
    this.name = "MalformedOutputError";
  }
}

/**
 * Ingests a file and extracts its fields. Throws `UsageError` for a bad path or
 * prompt, `InfraError` when Ollama fails, `MalformedOutputError` when the output
 * is still invalid after one retry.
 */
export async function extractFile(
  path: string,
  client: ModelClient,
  options: ExtractOptions = DEFAULT_EXTRACT_OPTIONS,
): Promise<ExtractionResult> {
  const startedAt = performance.now();
  const prompt = loadPrompt(options.promptId);
  const ingested = await ingest(path);
  if (ingested.status === "rejected") {
    return {
      status: "rejected",
      reason: ingested.reason,
      meta: runMeta(prompt, options, startedAt, {}),
    };
  }
  return extractSource(ingested.source, client, options, prompt, startedAt);
}

/** Extraction from already-ingested text (SPEC §5, §7). */
export async function extractSource(
  source: IngestedSource,
  client: ModelClient,
  options: ExtractOptions = DEFAULT_EXTRACT_OPTIONS,
  prompt: Prompt = loadPrompt(options.promptId),
  startedAt: number = performance.now(),
): Promise<ExtractionResult> {
  const { num_ctx, num_predict } = options.options;
  const sourceMeta = {
    sourceType: source.sourceType,
    bytes: source.bytes,
    unmappedGlyphs: source.unmappedGlyphs,
    ...(source.pageCount === undefined ? {} : { pageCount: source.pageCount }),
  };

  // SPEC §7: too_large on the whole ingested text, whether or not retrieval is on
  const estimate = Math.ceil(
    (prompt.text.length + source.text.length) / CHARS_PER_TOKEN,
  );
  if (estimate + num_predict > num_ctx) {
    return reject(
      "too_large",
      runMeta(prompt, options, startedAt, { source: sourceMeta }),
    );
  }

  const modelDigest = await client.modelDigest(options.model);
  const messages: ChatMessage[] = [
    { role: "system", content: prompt.text },
    {
      role: "user",
      content: renderDocument(documentText(source.text, options.retrieval)),
    },
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let output: ModelOutput | undefined;
  let lastError = "";
  let lastContent = "";
  let attempts = 0;
  const meta = () =>
    runMeta(prompt, options, startedAt, {
      modelDigest,
      retries: Math.max(attempts - 1, 0),
      promptTokens,
      completionTokens,
      source: sourceMeta,
    });

  while (output === undefined && attempts < MAX_ATTEMPTS) {
    attempts++;
    const response = await client.chat({
      model: options.model,
      messages,
      format: modelOutputJsonSchema,
      options: options.options,
    });
    promptTokens += response.promptTokens;
    completionTokens += response.completionTokens;
    // The estimate can undercount (digits are often one token each); trust the measured count
    if (response.promptTokens + num_predict > num_ctx) {
      return reject("too_large", meta());
    }

    const parsed = parseModelOutput(response.content);
    if (parsed.ok) {
      output = parsed.output;
    } else {
      lastError = parsed.error;
      lastContent = response.content;
      messages.push(
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: `Your previous output was invalid:\n${parsed.error}\nReturn the corrected JSON only.`,
        },
      );
    }
  }
  if (output === undefined) {
    throw new MalformedOutputError(lastError, lastContent, meta());
  }

  if (output.status === "rejected") {
    // The schema guarantees a reason for a reject
    return reject(output.reason ?? "out_of_scope", meta());
  }
  const collapsed = collapseWhitespace(source.text);
  const fields = Object.fromEntries(
    FIELD_NAMES.map((name) => [
      name,
      buildField(name, output.fields[name], source.text, collapsed),
    ]),
  ) as ExtractedFields;
  return { status: "extracted", fields, meta: meta() };
}

function documentText(text: string, retrieval: boolean): string[] {
  if (!retrieval) return [text];
  return retrieve(text, chunk(text)).passages.map((p) => p.text);
}

/** Normalises and grounds one field (SPEC §4 multiple evidence items, §5 grounding). */
function buildField(
  name: FieldName,
  field: ModelField,
  source: string,
  collapsed: CollapsedText,
): FieldResult<string> {
  if (field.status === "not_found") {
    return field.reason === null
      ? { status: "not_found" }
      : { status: "not_found", reason: field.reason };
  }

  const values: string[] = [];
  for (const { raw } of field.evidence) {
    const normalised = normalise(FIELD_KINDS[name], raw, source);
    if (!normalised.ok)
      return { status: "not_found", reason: normalised.reason };
    values.push(normalised.value);
  }

  let value: string;
  if (name === "taxAmount") {
    value = formatCents(values.reduce((sum, v) => sum + toCents(v), 0n));
  } else {
    const distinct = new Set(values);
    if (distinct.size > 1)
      return { status: "not_found", reason: "conflicting" };
    value = values[0] ?? "";
  }

  return {
    status: "found",
    value,
    // Grounding never changes status or value (SPEC §5)
    evidence: field.evidence.map((e) =>
      groundEvidence(e.raw, e.quote, collapsed),
    ),
  };
}

function reject(reason: RejectReason, meta: RunMeta): ExtractionResult {
  return { status: "rejected", reason, meta };
}

function runMeta(
  prompt: Prompt,
  options: ExtractOptions,
  startedAt: number,
  measured: Partial<RunMeta>,
): RunMeta {
  return {
    appVersion: appVersion(),
    model: options.model,
    modelDigest: null,
    promptId: prompt.id,
    promptHash: prompt.hash,
    options: options.options,
    retrieval: options.retrieval,
    hardware: hardwareProfile(),
    retries: 0,
    promptTokens: 0,
    completionTokens: 0,
    ...measured,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}
