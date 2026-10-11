import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FIELD_KINDS, FIELD_NAMES } from "../../src/extract/fields.ts";
import {
  collapseWhitespace,
  groundEvidence,
} from "../../src/extract/grounding.ts";
import { normalise } from "../../src/extract/normalise.ts";
import { csvToText } from "../../src/ingest/csv.ts";
import { extractPdfText } from "../../src/ingest/pdf.ts";
import { normaliseText } from "../../src/ingest/text.ts";
import {
  type CaseInfo,
  type GeneratedCase,
  generateCase,
  type GeneratorOptions,
} from "./generate.ts";
import { luhnCheckDigit } from "./invoice.ts";
import { LAYOUTS, type Layout } from "./print.ts";

const info: CaseInfo = {
  id: "GEN-TEST",
  partition: "clean",
  difficulty: "easy",
  risks: [],
  smoke: false,
};
const sha256 = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const ALL_LAYOUTS: Layout[] = [...LAYOUTS.pdf, ...LAYOUTS.txt, ...LAYOUTS.csv];
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

/** The text the app's ingest step would produce for the generated input. */
function ingestedText(c: GeneratedCase): string {
  const decoded = () =>
    new TextDecoder("utf-8", { fatal: true }).decode(c.input.data);
  switch (c.input.extension) {
    case "pdf":
      return extractPdfText(c.input.data).text;
    case "csv":
      return csvToText(decoded());
    case "txt":
      return normaliseText(decoded());
  }
}

describe("determinism", () => {
  it.each(ALL_LAYOUTS)(
    "%s: the same seed gives byte-identical files",
    async (layout) => {
      const a = await generateCase(7, { layout }, info);
      const b = await generateCase(7, { layout }, info);
      expect(sha256(a.input.data)).toBe(sha256(b.input.data));
      expect(JSON.stringify(a.expected)).toBe(JSON.stringify(b.expected));
      expect(JSON.stringify(a.meta)).toBe(JSON.stringify(b.meta));
    },
  );

  it("different seeds give different invoices", async () => {
    const a = await generateCase(1, { layout: "classic" }, info);
    const b = await generateCase(2, { layout: "classic" }, info);
    expect(sha256(a.input.data)).not.toBe(sha256(b.input.data));
  });

  it("an option replaces its draw without reshuffling the rest", async () => {
    const plain = await generateCase(3, { layout: "classic" }, info);
    const varied = await generateCase(
      3,
      {
        layout: "classic",
        deposit: true,
        shipping: true,
        show: { dueDate: false },
        dateFormat: "iso",
      },
      info,
    );
    expect(varied.invoice.invoiceNumber).toBe(plain.invoice.invoiceNumber);
    expect(varied.invoice.vendor).toEqual(plain.invoice.vendor);
    expect(varied.invoice.customer).toEqual(plain.invoice.customer);
    expect(varied.invoice.lines).toEqual(plain.invoice.lines);
    expect(varied.invoice.deposit).toBeGreaterThan(0);
    expect(varied.printed.dueDate).toBeNull();
  });
});

/** Checks every generated case must pass, mirroring the Phase 2 dataset tests. */
function checkCase(c: GeneratedCase): void {
  const source = ingestedText(c);
  const collapsed = collapseWhitespace(source);
  expect(Object.keys(c.expected.fields)).toEqual([...FIELD_NAMES]);

  for (const name of FIELD_NAMES) {
    const field = c.expected.fields[name];
    if (field.status === "found") {
      expect(field.evidence.length, name).toBeGreaterThan(0);
      for (const { raw, quote } of field.evidence) {
        // Every expected quote grounds in the ingested text (SPEC §5)
        expect(
          groundEvidence(raw, quote, collapsed).grounded,
          `${name}: ${quote}`,
        ).toBe(true);
      }
      // The app's normaliser reads each raw as the expected value (SPEC §4)
      const values = field.evidence.map(({ raw }) =>
        normalise(FIELD_KINDS[name], raw, source),
      );
      if (name === "taxAmount") {
        const total = values.reduce((sum, v) => {
          if (!v.ok) throw new Error(`taxAmount raw unparseable`);
          return sum + Math.round(Number(v.value) * 100);
        }, 0);
        expect(total, name).toBe(Math.round(Number(field.value) * 100));
      } else if (name !== "vendorName" && name !== "customerName") {
        for (const v of values)
          expect(v, name).toEqual({ ok: true, value: field.value });
      }
      expect(field.decoys ?? [], name).not.toContain(field.value);
    } else if (field.reason === "ambiguous") {
      // Ambiguous by the normaliser too
      const raw =
        name === "invoiceDate"
          ? c.printed.invoiceDate
          : (c.printed.dueDate ?? "");
      expect(normalise("date", raw, source), name).toEqual({
        ok: false,
        reason: "ambiguous",
      });
    }
  }

  // FMT-* rules (SPEC §9)
  const value = (name: (typeof FIELD_NAMES)[number]) => {
    const f = c.expected.fields[name];
    return f.status === "found" ? f.value : undefined;
  };
  for (const date of [value("invoiceDate"), value("dueDate")]) {
    if (date !== undefined)
      expect(date >= "2000-01-01" && date <= "2099-12-31").toBe(true);
  }
  const currency = value("currency");
  if (currency !== undefined) expect(["CAD", "USD"]).toContain(currency);
  const taxId = value("vendorTaxId");
  if (taxId !== undefined) {
    expect(taxId).toMatch(/^\d{9}RT\d{4}$/u);
    // Never a valid business number, so never a real registration
    expect(luhnCheckDigit(taxId.slice(0, 8))).not.toBe(Number(taxId[8]));
  }

  // Synthetic marker is in every document
  expect(collapsed.text).toContain("Synthetic test document.");
}

describe("generated cases are consistent with SPEC.md and the app's ingest", () => {
  const combos = ALL_LAYOUTS.flatMap((layout) =>
    SEEDS.map((seed) => [layout, seed] as const),
  );
  it.each(combos)("%s seed %i", async (layout, seed) => {
    checkCase(await generateCase(seed, { layout }, info));
  });

  const variants: [string, GeneratorOptions][] = [
    [
      "French amounts in text",
      { layout: "plain", amountStyle: "fr", currencyMark: "$" },
    ],
    [
      "French amounts in CSV",
      { layout: "lines", amountStyle: "fr", currencyMark: "CAD" },
    ],
    ["USD symbol", { layout: "classic", currency: "USD", currencyMark: "US$" }],
    ["no currency", { layout: "erp", currencyMark: null }],
    ["deposit", { layout: "erp", deposit: true }],
    [
      "missing fields",
      {
        layout: "classic",
        show: { dueDate: false, vendorTaxId: false, subtotal: false },
      },
    ],
    ["zero tax", { layout: "plain", tax: "zero", shipping: false }],
    ["no tax line", { layout: "summary", tax: "none" }],
    ["due on receipt", { layout: "classic", dueDays: 0 }],
    ["very large amounts", { layout: "classic", priceScale: 1000 }],
    ["multi-page", { layout: "classic", lineCount: 45 }],
    ["multi-page ERP", { layout: "erp", lineCount: 60 }],
    [
      "Quebec bilingual",
      { layout: "bilingual", vendorProvince: "QC", customerProvince: "QC" },
    ],
  ];
  it.each(variants)("%s", async (_label, options) => {
    checkCase(await generateCase(5, options, info));
  });
});

describe("expected values", () => {
  it("numeric dates are ambiguous unless a printed date has a part > 12", async () => {
    // 2026-03-04 due 2026-04-03: both parts ≤ 12 in both dates
    const c = await generateCase(
      1,
      {
        layout: "plain",
        invoiceDate: "2026-03-04",
        dueDays: 30,
        dateFormat: "dmy",
      },
      info,
    );
    const source = ingestedText(c);
    expect(c.expected.fields.invoiceDate).toEqual({
      status: "not_found",
      reason: "ambiguous",
      decoys: ["2026-03-04", "2026-04-03"],
    });
    expect(normalise("date", c.printed.invoiceDate, source)).toEqual({
      ok: false,
      reason: "ambiguous",
    });

    // Due 2026-04-18 resolves the order
    const resolved = await generateCase(
      1,
      {
        layout: "plain",
        invoiceDate: "2026-03-04",
        dueDays: 45,
        dateFormat: "dmy",
      },
      info,
    );
    expect(resolved.expected.fields.invoiceDate).toMatchObject({
      status: "found",
      value: "2026-03-04",
    });
  });

  it("a deposit makes total and amount due decoys of each other", async () => {
    const c = await generateCase(2, { layout: "classic", deposit: true }, info);
    const { total, amountDue } = c.expected.fields;
    expect(total.status === "found" && amountDue.status === "found").toBe(true);
    if (total.status !== "found" || amountDue.status !== "found") return;
    expect(total.decoys).toEqual([amountDue.value]);
    expect(amountDue.decoys).toEqual([total.value]);
  });

  it("shipping breaks XF-1 and the meta lists it", async () => {
    const c = await generateCase(
      4,
      { layout: "classic", shipping: true },
      info,
    );
    expect(c.meta.violatesRules).toEqual(["XF-1"]);
    const clean = await generateCase(
      4,
      { layout: "classic", shipping: false },
      info,
    );
    expect(clean.meta.violatesRules).toEqual([]);
  });

  it("a total off by one cent still satisfies XF-1; two cents doesn't", async () => {
    const options = {
      layout: "classic",
      shipping: false,
      tax: "province",
    } as const;
    expect(
      (await generateCase(6, { ...options, totalAdjustCents: 1 }, info)).meta
        .violatesRules,
    ).toEqual([]);
    expect(
      (await generateCase(6, { ...options, totalAdjustCents: 2 }, info)).meta
        .violatesRules,
    ).toEqual(["XF-1"]);
  });

  it("a hidden GST/HST number is not_found, with a printed QST number as its decoy", async () => {
    const c = await generateCase(
      8,
      { layout: "classic", vendorProvince: "QC", show: { vendorTaxId: false } },
      info,
    );
    expect(c.expected.fields.vendorTaxId).toMatchObject({
      status: "not_found",
      reason: "absent",
    });
    const decoys = c.expected.fields.vendorTaxId.decoys ?? [];
    expect(decoys).toHaveLength(1);
    expect(decoys[0]).toMatch(/^\d{10}TQ0001$/u);
  });

  it("rejects a currency mark that contradicts the currency", async () => {
    await expect(
      generateCase(1, { currency: "USD", currencyMark: "$" }, info),
    ).rejects.toThrow(/doesn't mean USD/u);
  });

  it("rejects a layout from another format", async () => {
    await expect(
      generateCase(1, { format: "csv", layout: "classic" }, info),
    ).rejects.toThrow(/not a csv layout/u);
  });
});
