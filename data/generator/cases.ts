import type { CaseInfo, GeneratorOptions } from "./generate.ts";

export type CaseSpec = {
  seed: number;
  options: GeneratorOptions;
  info: CaseInfo;
};

/** Clean: every field printed once, no decoys beyond the usual PO and customer numbers, unambiguous dates. */
const clean: GeneratorOptions = {
  shipping: false,
  deposit: false,
  shipTo: false,
  show: { remitTo: false },
};

const info = (
  id: string,
  partition: string,
  difficulty: CaseInfo["difficulty"],
  risks: string[],
  notes?: string,
): CaseInfo => ({
  id,
  partition,
  difficulty,
  risks,
  smoke: false,
  ...(notes === undefined ? {} : { notes }),
});

/**
 * The generated golden cases (docs/specs.md, Phase 2): the clean and boundary
 * partitions. `npm run generate:cases` writes them to `data/cases/<id>/`, and a
 * test checks the committed files still match, so a generator change can't
 * silently change a reviewed case. A case that is hand-edited after
 * generation leaves this list.
 */
export const CASES: CaseSpec[] = [
  // Clean: one per layout, plus a USD invoice
  {
    seed: 101,
    options: { ...clean, layout: "classic", dateFormat: "long" },
    info: info("CASE-0001", "clean", "easy", ["R-6"]),
  },
  {
    seed: 102,
    options: { ...clean, layout: "erp", dateFormat: "iso" },
    info: info("CASE-0002", "clean", "easy", ["R-3", "R-6"]),
  },
  {
    seed: 103,
    options: {
      ...clean,
      layout: "bilingual",
      vendorProvince: "QC",
      customerProvince: "QC",
      dateFormat: "fr",
    },
    info: info("CASE-0003", "clean", "easy", ["R-4", "R-8", "R-9"]),
  },
  {
    seed: 104,
    options: { ...clean, layout: "plain", dateFormat: "short" },
    info: info("CASE-0004", "clean", "easy", ["R-3", "R-6"]),
  },
  {
    seed: 105,
    options: { ...clean, layout: "email", dateFormat: "dmy-abbr" },
    info: info("CASE-0005", "clean", "easy", ["R-6", "R-13"]),
  },
  {
    seed: 106,
    options: { ...clean, layout: "lines", dateFormat: "iso" },
    info: info("CASE-0006", "clean", "easy", ["R-6", "R-8", "R-9"]),
  },
  {
    seed: 107,
    options: { ...clean, layout: "summary", dateFormat: "iso" },
    info: info("CASE-0007", "clean", "easy", ["R-6"]),
  },
  {
    seed: 108,
    options: {
      ...clean,
      layout: "classic",
      currency: "USD",
      currencyMark: "US$",
      dateFormat: "long",
    },
    info: info("CASE-0008", "clean", "easy", ["R-3", "R-8", "R-9"]),
  },

  // Boundary (cross-field)
  {
    seed: 201,
    options: {
      ...clean,
      layout: "classic",
      tax: "province",
      totalAdjustCents: 1,
      dateFormat: "long",
    },
    info: info("CASE-0009", "boundary (cross-field)", "medium", [
      "R-1",
      "R-11",
    ]),
  },
  {
    seed: 202,
    options: { ...clean, layout: "plain", dueDays: 0, dateFormat: "iso" },
    info: info("CASE-0010", "boundary (cross-field)", "medium", [
      "R-8",
      "R-9",
      "R-10",
    ]),
  },
  {
    seed: 203,
    options: { ...clean, layout: "erp", tax: "zero", dateFormat: "dmy-abbr" },
    info: info("CASE-0011", "boundary (cross-field)", "medium", ["R-9"]),
  },
  {
    seed: 204,
    options: {
      ...clean,
      layout: "bilingual",
      vendorProvince: "QC",
      customerProvince: "QC",
      priceScale: 1000,
      dateFormat: "iso",
    },
    info: info("CASE-0012", "boundary (cross-field)", "hard", [
      "R-4",
      "R-8",
      "R-9",
    ]),
  },
  {
    seed: 205,
    options: { ...clean, layout: "classic", lineCount: 45, dateFormat: "long" },
    info: info("CASE-0013", "boundary (cross-field)", "hard", ["R-1", "R-14"]),
  },
];
