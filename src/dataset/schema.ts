import { z } from "zod";
import { RULE_IDS } from "./rules.ts";

/** The partitions of the docs/specs.md Phase 2 target distribution, plus Phase 4's adversarial cases. */
export const PARTITIONS = [
  "clean",
  "missing fields",
  "conflicting values",
  "decoys",
  "messy formatting",
  "boundary (cross-field)",
  "should-reject",
  "adversarial",
] as const;

const nonBlank = z.string().refine((s) => s.trim() !== "", "must not be blank");

/** An expected field (SPEC §6) whose found `value` matches `value`. */
function expectedField(value: z.ZodType<string>) {
  return z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("found"),
      value,
      // Optional in expected files; used for judge calibration (docs/specs.md, Phase 2)
      evidence: z
        .array(z.strictObject({ raw: nonBlank, quote: nonBlank }))
        .min(1)
        .optional(),
      alternatives: z.array(value).optional(),
      decoys: z.array(nonBlank).optional(),
    }),
    z.strictObject({
      status: z.literal("not_found"),
      reason: z
        .enum(["absent", "ambiguous", "conflicting", "unparseable"])
        .optional(),
      decoys: z.array(nonBlank).optional(),
    }),
  ]);
}

/** Normalised forms (SPEC §3). Range and pattern rules are `FMT-*`, checked separately. */
const amount = z.string().regex(/^-?\d+\.\d{2}$/u, "a 2-dp decimal string");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "YYYY-MM-DD");

export const expectedSchema = z.discriminatedUnion("status", [
  z.strictObject({
    caseId: nonBlank,
    status: z.literal("extracted"),
    fields: z.strictObject({
      invoiceNumber: expectedField(nonBlank),
      invoiceDate: expectedField(date),
      dueDate: expectedField(date),
      vendorName: expectedField(nonBlank),
      vendorTaxId: expectedField(nonBlank),
      customerName: expectedField(nonBlank),
      currency: expectedField(nonBlank),
      subtotal: expectedField(amount),
      taxAmount: expectedField(amount),
      total: expectedField(amount),
      amountDue: expectedField(amount),
    }),
  }),
  z.strictObject({
    caseId: nonBlank,
    status: z.literal("rejected"),
    reason: z.enum([
      "empty",
      "too_large",
      "unreadable",
      "unsupported_language",
      "out_of_scope",
      "multiple_documents",
    ]),
  }),
]);

export type ExpectedFile = z.infer<typeof expectedSchema>;

/** docs/specs.md, Phase 2: Case files. */
export const metaSchema = z
  .strictObject({
    id: z.string().regex(/^(EX-\d{2}|CASE-\d{4})$/u, "EX-NN or CASE-NNNN"),
    partition: z.enum(PARTITIONS),
    difficulty: z.enum(["easy", "medium", "hard"]),
    risks: z.array(z.string().regex(/^R-\d+$/u)).min(1),
    sourceFormat: z.enum(["pdf", "csv", "txt"]),
    smoke: z.boolean(),
    violatesRules: z.array(z.enum(RULE_IDS)),
    reviewedBy: nonBlank.nullable(),
    reviewedAt: z.iso.date().nullable(),
    notes: z.string(),
    /** Generated cases: regenerating with these gives the same files, unless `edited` says what was changed by hand (decision #59). */
    generator: z
      .strictObject({
        version: nonBlank,
        seed: z.int().min(0),
        options: z.record(z.string(), z.unknown()),
        edited: nonBlank.optional(),
      })
      .optional(),
  })
  .refine((m) => (m.reviewedBy === null) === (m.reviewedAt === null), {
    message: "reviewedBy and reviewedAt are set together",
  });

export type MetaFile = z.infer<typeof metaSchema>;
