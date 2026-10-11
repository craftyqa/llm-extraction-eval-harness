import { FIELD_NAMES, type FieldName } from "../../src/extract/fields.ts";
import type { Invoice } from "./invoice.ts";
import type { Printed, Style } from "./print.ts";

/** SPEC §6 expected field: the output shape without offsets or `grounded`, plus grading-only keys. */
export type ExpectedField =
  | {
      status: "found";
      value: string;
      evidence: { raw: string; quote: string }[];
      alternatives?: string[];
      decoys?: string[];
    }
  | { status: "not_found"; reason: "absent" | "ambiguous"; decoys?: string[] };

export type Expected = {
  caseId: string;
  status: "extracted";
  fields: Record<FieldName, ExpectedField>;
};

/**
 * The SPEC §6 expected file for a printed invoice. Values come from the
 * invoice's facts, evidence from the printed strings. Each quote is the printed
 * value itself, which every renderer prints verbatim, so it grounds whatever the
 * layout; `currency` quotes the amount or line that carries the mark.
 */
export function buildExpected(
  caseId: string,
  invoice: Invoice,
  printed: Printed,
  style: Style,
): Expected {
  const fields: Partial<Record<FieldName, ExpectedField>> = {};
  const found = (
    value: string,
    raws: string[],
    decoys: string[] = [],
    quote?: string,
  ): ExpectedField =>
    withDecoys(
      {
        status: "found",
        value,
        evidence: raws.map((raw) => ({ raw, quote: quote ?? raw })),
      },
      decoys.filter((d) => d !== value),
    );
  const absent = (decoys: string[] = []): ExpectedField =>
    withDecoys({ status: "not_found", reason: "absent" }, decoys);

  fields.invoiceNumber = found(
    invoice.invoiceNumber,
    [printed.invoiceNumber],
    [invoice.poNumber, invoice.customerId],
  );

  const printedDates = [printed.invoiceDate, printed.dueDate].filter(
    (d) => d !== null,
  );
  fields.invoiceDate = dateField(
    invoice.invoiceDate,
    printed.invoiceDate,
    printedDates,
    style,
  );
  fields.dueDate =
    printed.dueDate === null
      ? absent()
      : dateField(invoice.dueDate, printed.dueDate, printedDates, style);

  fields.vendorName = found(
    invoice.vendor.name,
    [printed.vendorName],
    [printed.bank, printed.remitTo].filter((d) => d !== null),
  );

  const provincialDecoys =
    printed.provincialTaxId === null
      ? []
      : [printed.provincialTaxId.value.replace(/[\s-]/gu, "")];
  fields.vendorTaxId =
    printed.gstNumber === null
      ? absent(provincialDecoys)
      : found(invoice.vendor.gstNumber, [printed.gstNumber], provincialDecoys);

  fields.customerName = found(
    invoice.customer.name,
    [printed.customerName],
    [printed.attn, ...(printed.shipTo === null ? [] : [printed.shipTo.name])],
  );

  fields.currency =
    style.currencyMark === null
      ? absent()
      : found(
          invoice.currency,
          [style.currencyMark],
          [],
          printed.currencyNote ?? printed.total,
        );

  fields.subtotal =
    printed.subtotal === null
      ? absent()
      : found(cents(invoice.subtotal), [printed.subtotal]);

  fields.taxAmount =
    invoice.taxes.length === 0
      ? absent()
      : found(
          cents(invoice.taxes.reduce((a, t) => a + t.amount, 0)),
          printed.taxes.map((t) => t.amount),
          invoice.taxes.length > 1
            ? invoice.taxes.map((t) => cents(t.amount))
            : [],
        );

  const depositDecoy = (other: number) =>
    invoice.deposit > 0 ? [cents(other)] : [];
  fields.total = found(
    cents(invoice.total),
    [printed.total],
    depositDecoy(invoice.amountDue),
  );
  fields.amountDue = found(
    cents(invoice.amountDue),
    [printed.combinedTotal ? printed.total : printed.amountDue],
    depositDecoy(invoice.total),
  );

  const ordered = Object.fromEntries(
    FIELD_NAMES.map((name) => [name, fields[name]]),
  );
  return { caseId, status: "extracted", fields: ordered as Expected["fields"] };
}

/**
 * A date field under SPEC §4: a numeric date with both parts ≤ 12 and unequal
 * is decided only by another printed date in the same format with a part > 12;
 * otherwise it's `ambiguous`, and both readings are decoys.
 */
function dateField(
  iso: string,
  raw: string,
  printedDates: string[],
  style: Style,
): ExpectedField {
  const found: ExpectedField = {
    status: "found",
    value: iso,
    evidence: [{ raw, quote: raw }],
  };
  if (style.dateFormat !== "mdy" && style.dateFormat !== "dmy") return found;
  const [, m = "", d = ""] = iso.split("-");
  if (Number(m) === Number(d)) return found;
  const dayFirst = style.dateFormat === "dmy";
  const resolved = printedDates.some((p) => {
    const [first = "", second = ""] = p.split("/");
    return Number(dayFirst ? first : second) > 12;
  });
  if (resolved) return found;
  const [y = ""] = iso.split("-");
  return {
    status: "not_found",
    reason: "ambiguous",
    decoys: [iso, `${y}-${d}-${m}`],
  };
}

function withDecoys<T extends ExpectedField>(field: T, decoys: string[]): T {
  const unique = [...new Set(decoys)];
  return unique.length === 0 ? field : { ...field, decoys: unique };
}

/** Integer cents → 2-dp string. */
export function cents(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}${String(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * SPEC §9 cross-field rules the printed document itself breaks, checked only
 * when every field a rule uses is expected found (the `violatesRules` in `meta.json`).
 */
export function violatedRules(expected: Expected): string[] {
  const value = (name: FieldName) => {
    const field = expected.fields[name];
    return field.status === "found" ? field.value : undefined;
  };
  const toCents = (s: string) => Math.round(Number(s) * 100);
  const rules: string[] = [];
  const subtotal = value("subtotal");
  const tax = value("taxAmount");
  const total = value("total");
  if (subtotal !== undefined && tax !== undefined && total !== undefined) {
    if (Math.abs(toCents(subtotal) + toCents(tax) - toCents(total)) > 1)
      rules.push("XF-1");
  }
  const invoiceDate = value("invoiceDate");
  const dueDate = value("dueDate");
  if (
    invoiceDate !== undefined &&
    dueDate !== undefined &&
    dueDate < invoiceDate
  ) {
    rules.push("XF-2");
  }
  return rules;
}
