import type { FieldName } from "../extract/fields.ts";
import { toCents } from "../extract/normalise.ts";

export const RULE_IDS = ["XF-1", "XF-2", "FMT-1", "FMT-2", "FMT-3"] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** `skipped` when a field the rule uses wasn't found (SPEC §9). */
export type RuleOutcome = "pass" | "fail" | "skipped";

/** Normalised values of the found fields; a missing key is `not_found`. */
export type FoundValues = Partial<Record<FieldName, string>>;

/**
 * SPEC §9 model-free rules over normalised values. `XF-3` (stretch, warning
 * only) isn't implemented. Each rule is checked only when every field it uses
 * was found.
 */
export function checkRules(values: FoundValues): Record<RuleId, RuleOutcome> {
  const outcome = (holds: boolean): RuleOutcome => (holds ? "pass" : "fail");
  const {
    subtotal,
    taxAmount,
    total,
    invoiceDate,
    dueDate,
    currency,
    vendorTaxId,
  } = values;

  const dates = [invoiceDate, dueDate].filter((d) => d !== undefined);
  return {
    "XF-1":
      subtotal === undefined || taxAmount === undefined || total === undefined
        ? "skipped"
        : outcome(
            abs(toCents(subtotal) + toCents(taxAmount) - toCents(total)) <= 1n,
          ),
    "XF-2":
      invoiceDate === undefined || dueDate === undefined
        ? "skipped"
        : outcome(dueDate >= invoiceDate),
    "FMT-1":
      dates.length === 0
        ? "skipped"
        : outcome(
            dates.every(
              (d) =>
                /^\d{4}-\d{2}-\d{2}$/u.test(d) &&
                d >= "2000-01-01" &&
                d <= "2099-12-31",
            ),
          ),
    "FMT-2":
      currency === undefined
        ? "skipped"
        : outcome(currency === "CAD" || currency === "USD"),
    "FMT-3":
      vendorTaxId === undefined
        ? "skipped"
        : outcome(/^\d{9}RT\d{4}$/u.test(vendorTaxId)),
  };
}

/** The rules that fail for these values. */
export function failedRules(values: FoundValues): RuleId[] {
  const outcomes = checkRules(values);
  return RULE_IDS.filter((id) => outcomes[id] === "fail");
}

const abs = (n: bigint) => (n < 0n ? -n : n);
