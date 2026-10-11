import { Faker, base, en, en_CA } from "@faker-js/faker";
import { z } from "zod";
import {
  buildExpected,
  cents,
  type Expected,
  violatedRules,
} from "./expected.ts";
import { generateInvoice, type Invoice, PROVINCES } from "./invoice.ts";
import {
  CURRENCY_MARKS,
  DATE_FORMATS,
  drawStyle,
  LAYOUTS,
  type Printed,
  printInvoice,
  type SourceFormat,
  type Style,
} from "./print.ts";
import { renderCsv } from "./render-csv.ts";
import { renderPdf } from "./render-pdf.ts";
import { renderTxt } from "./render-txt.ts";

/**
 * Bump when the same seed and options produce different files, so a case's
 * `meta.json` says which generator made it.
 */
export const GENERATOR_VERSION = "1.0.0";

const province = z.enum(PROVINCES);
const layout = z.enum([...LAYOUTS.pdf, ...LAYOUTS.txt, ...LAYOUTS.csv]);

/** Every option is drawn from the seed when not given (see `generateInvoice` and `drawStyle`). */
export const generatorOptionsSchema = z.strictObject({
  // Facts
  vendorProvince: province.optional(),
  customerProvince: province.optional(),
  currency: z.enum(["CAD", "USD"]).optional(),
  lineCount: z.int().min(1).max(60).optional(),
  priceScale: z.int().min(1).max(10_000).optional(),
  shipping: z.boolean().optional(),
  deposit: z.boolean().optional(),
  tax: z.enum(["province", "zero", "none"]).optional(),
  dueDays: z.int().min(-365).max(365).optional(),
  invoiceDate: z.iso.date().optional(),
  shipTo: z.boolean().optional(),
  totalAdjustCents: z.int().min(-100_000).max(100_000).optional(),
  // Style
  format: z.enum(["pdf", "txt", "csv"]).optional(),
  layout: layout.optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  amountStyle: z.enum(["en", "fr", "plain"]).optional(),
  currencyMark: z.enum(CURRENCY_MARKS).nullable().optional(),
  combinedTotal: z.boolean().optional(),
  taxIdStyle: z.enum(["grouped", "spaced", "compact"]).optional(),
  show: z
    .strictObject({
      dueDate: z.boolean().optional(),
      vendorTaxId: z.boolean().optional(),
      provincialTaxId: z.boolean().optional(),
      subtotal: z.boolean().optional(),
      bank: z.boolean().optional(),
      remitTo: z.boolean().optional(),
    })
    .optional(),
});

export type GeneratorOptions = z.infer<typeof generatorOptionsSchema>;

/** The `meta.json` keys a person decides (docs/specs.md, Phase 2: Case files). */
export type CaseInfo = {
  id: string;
  partition: string;
  difficulty: "easy" | "medium" | "hard";
  risks: string[];
  smoke: boolean;
  /** Defaults to a summary of what the generator drew. */
  notes?: string;
};

export type Meta = {
  id: string;
  partition: string;
  difficulty: string;
  risks: string[];
  sourceFormat: SourceFormat;
  smoke: boolean;
  violatesRules: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string;
  /** Provenance: regenerating with these gives the same files. */
  generator: { version: string; seed: number; options: GeneratorOptions };
};

export type GeneratedCase = {
  /** `input.<extension>` in the case directory. */
  input: { extension: SourceFormat; data: Uint8Array };
  expected: Expected;
  meta: Meta;
  invoice: Invoice;
  style: Style;
  printed: Printed;
};

/**
 * One case from a seed: faker (seeded) → invoice facts → style → printed
 * strings → rendered file, plus its expected file and `meta.json`. The same
 * seed and options give byte-identical output.
 */
export async function generateCase(
  seed: number,
  rawOptions: GeneratorOptions,
  info: CaseInfo,
): Promise<GeneratedCase> {
  const options = generatorOptionsSchema.parse(rawOptions);
  const faker = new Faker({ locale: [en_CA, en, base] });
  faker.seed(seed);

  const invoice = generateInvoice(faker, options);
  const style = drawStyle(faker, invoice, options);
  const printed = printInvoice(invoice, style);
  const data = await render(printed, style, invoice);
  const expected = buildExpected(info.id, invoice, printed, style);

  return {
    input: { extension: style.format, data },
    expected,
    meta: {
      id: info.id,
      partition: info.partition,
      difficulty: info.difficulty,
      risks: info.risks,
      sourceFormat: style.format,
      smoke: info.smoke,
      violatesRules: violatedRules(expected),
      reviewedBy: null,
      reviewedAt: null,
      notes: info.notes ?? describe(invoice, style, printed),
      generator: { version: GENERATOR_VERSION, seed, options },
    },
    invoice,
    style,
    printed,
  };
}

async function render(
  printed: Printed,
  style: Style,
  invoice: Invoice,
): Promise<Uint8Array> {
  const encode = (text: string) => new TextEncoder().encode(text);
  switch (style.layout) {
    case "classic":
    case "erp":
    case "bilingual":
      return renderPdf(printed, style.layout, invoice.invoiceDate);
    case "plain":
    case "email":
      return encode(renderTxt(printed, style.layout));
    case "lines":
    case "summary":
      return encode(renderCsv(printed, style.layout));
  }
}

/** A one-line summary for the reviewer: what the generator drew that matters for grading. */
function describe(invoice: Invoice, style: Style, printed: Printed): string {
  const parts = [
    `Generated ${style.format}/${style.layout}, ${String(invoice.lines.length)} lines`,
  ];
  parts.push(
    invoice.taxes.length === 0
      ? "no tax line"
      : invoice.taxes
          .map((t) => `${t.kind} ${String(t.rate / 1000)}%`)
          .join(" + "),
  );
  parts.push(
    style.currencyMark === null
      ? "no currency shown"
      : `${invoice.currency} shown as ${style.currencyMark}`,
  );
  parts.push(`${style.amountStyle} amounts`, `${style.dateFormat} dates`);
  if (invoice.shipping > 0) parts.push(`shipping ${cents(invoice.shipping)}`);
  if (invoice.deposit > 0)
    parts.push(`deposit ${cents(invoice.deposit)} (total vs amount due)`);
  if (printed.combinedTotal) parts.push("one Total Due line");
  if (printed.shipTo !== null) parts.push("ship-to site");
  if (printed.remitTo !== null) parts.push("remit-to lockbox");
  if (printed.dueDate === null) parts.push("no due date printed");
  if (printed.gstNumber === null) parts.push("no GST/HST number printed");
  if (printed.subtotal === null) parts.push("no subtotal printed");
  return parts.join("; ") + ".";
}
