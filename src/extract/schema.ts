import { z } from "zod";
import { FIELD_NAMES, type FieldName } from "./fields.ts";

/** Non-empty after trimming (decision #35). `minLength` reaches the JSON Schema; the refinement is app-side only. */
const nonBlank = z
  .string()
  .min(1)
  .refine((s) => s.trim() !== "", "must not be blank");

const evidenceItem = z.object({ raw: nonBlank, quote: nonBlank });

/**
 * One field as the model returns it. Flat rather than a union, so constrained
 * decoding stays simple for small models (decision #49): `reason` is null when
 * found, `evidence` empty when not found.
 */
const modelField = z
  .object({
    status: z.enum(["found", "not_found"]),
    reason: z.enum(["absent", "ambiguous", "conflicting"]).nullable(),
    evidence: z.array(evidenceItem),
  })
  .superRefine((field, ctx) => {
    if (field.status === "found" && field.evidence.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "a found field needs at least one evidence item",
      });
    }
    if (field.status === "not_found" && field.evidence.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "a not_found field must have no evidence",
      });
    }
  });

const modelFields = z.object(
  Object.fromEntries(FIELD_NAMES.map((name) => [name, modelField])) as Record<
    FieldName,
    typeof modelField
  >,
);

/** What the model returns. The app fills values, offsets and grounding (SPEC §5). */
export const modelOutputSchema = z
  .object({
    status: z.enum(["extracted", "rejected"]),
    reason: z
      .enum(["unsupported_language", "out_of_scope", "multiple_documents"])
      .nullable(),
    fields: modelFields,
  })
  .superRefine((output, ctx) => {
    if (output.status === "rejected" && output.reason === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "a rejected document needs a reason",
      });
    }
    if (output.status === "extracted" && output.reason !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "reason must be null when status is extracted",
      });
    }
  });

export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type ModelField = z.infer<typeof modelField>;

/** JSON Schema for Ollama's `format` parameter. */
export const modelOutputJsonSchema = z.toJSONSchema(modelOutputSchema);

/** Parses the model's raw text: JSON first, then the schema. The error message is fed back on retry. */
export function parseModelOutput(
  content: string,
): { ok: true; output: ModelOutput } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      error: `Output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = modelOutputSchema.safeParse(json);
  return result.success
    ? { ok: true, output: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}
