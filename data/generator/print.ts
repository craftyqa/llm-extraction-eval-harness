import type { Faker } from "@faker-js/faker";
import type { Address, Invoice, TaxKind } from "./invoice.ts";

export const LAYOUTS = {
  pdf: ["classic", "erp", "bilingual"],
  txt: ["plain", "email"],
  csv: ["lines", "summary"],
} as const;

export type SourceFormat = keyof typeof LAYOUTS;
export type Layout = (typeof LAYOUTS)[SourceFormat][number];

export const DATE_FORMATS = [
  "iso",
  "long",
  "short",
  "dmy-abbr",
  "mdy",
  "dmy",
  "fr",
] as const;
/**
 * `iso` 2026-09-14 · `long` September 14, 2026 · `short` Sep 14, 2026 ·
 * `dmy-abbr` 14-Sep-2026 · `mdy` 09/14/2026 · `dmy` 14/09/2026 · `fr` 14 septembre 2026
 */
export type DateFormat = (typeof DATE_FORMATS)[number];

/** `en` 1,234.50 · `fr` 1 234,50 · `plain` 1234.50 */
export type AmountStyle = "en" | "fr" | "plain";

/** Symbols mark every amount; codes print one `Currency: CAD` line. */
export const CURRENCY_MARKS = ["$", "C$", "US$", "CAD", "CDN", "USD"] as const;
export type CurrencyMark = (typeof CURRENCY_MARKS)[number];

/** `grouped` 81427 3390 RT0001 · `spaced` 814273390 RT0001 · `compact` 814273390RT0001 */
export type TaxIdStyle = "grouped" | "spaced" | "compact";

/** Elements a layout may leave out. Each defaults to shown, except `remitTo`, which is drawn. */
export type Shown = {
  dueDate: boolean;
  vendorTaxId: boolean;
  provincialTaxId: boolean;
  subtotal: boolean;
  bank: boolean;
  remitTo: boolean;
};

/** Options that change how the invoice is printed. Every option is drawn from the seed when not given. */
export type StyleOptions = {
  format?: SourceFormat;
  layout?: Layout;
  dateFormat?: DateFormat;
  amountStyle?: AmountStyle;
  /** `null` prints no currency at all. */
  currencyMark?: CurrencyMark | null;
  /** One "Total Due" line instead of "Total" and "Amount Due". Ignored when there's a deposit. */
  combinedTotal?: boolean;
  taxIdStyle?: TaxIdStyle;
  show?: Partial<Shown>;
};

export type Style = {
  format: SourceFormat;
  layout: Layout;
  dateFormat: DateFormat;
  amountStyle: AmountStyle;
  currencyMark: CurrencyMark | null;
  combinedTotal: boolean;
  taxIdStyle: TaxIdStyle;
  show: Shown;
};

/** Draws a style. Like `generateInvoice`, every draw happens whatever the options. */
export function drawStyle(
  faker: Faker,
  invoice: Invoice,
  options: StyleOptions = {},
): Style {
  const pick = <T>(items: readonly T[]): T => faker.helpers.arrayElement(items);

  const drawnFormat = faker.helpers.weightedArrayElement<SourceFormat>([
    { weight: 6, value: "pdf" },
    { weight: 2, value: "txt" },
    { weight: 2, value: "csv" },
  ]);
  const format = options.format ?? layoutFormat(options.layout) ?? drawnFormat;
  const drawnLayout = pick<Layout>(LAYOUTS[format]);
  const layout = options.layout ?? drawnLayout;
  if (!(LAYOUTS[format] as readonly Layout[]).includes(layout)) {
    throw new Error(`layout ${layout} is not a ${format} layout`);
  }

  const drawnDateFormat = pick<DateFormat>(
    layout === "bilingual"
      ? ["fr", "iso", "dmy"]
      : format === "csv"
        ? ["iso", "iso", "mdy"]
        : ["long", "short", "iso", "dmy-abbr", "mdy", "dmy"],
  );
  const drawnMark = pick<CurrencyMark>(
    invoice.currency === "USD"
      ? ["US$", "USD"]
      : format === "csv"
        ? ["CAD", "CAD", "CDN"]
        : ["$", "$", "$", "C$", "CAD", "CDN"],
  );
  const drawnCombined = faker.datatype.boolean(0.5);
  const drawnTaxIdStyle = pick<TaxIdStyle>(["grouped", "spaced", "compact"]);
  const drawnRemitTo = faker.datatype.boolean(0.3);

  const currencyMark =
    options.currencyMark === undefined ? drawnMark : options.currencyMark;
  if (
    currencyMark !== null &&
    markCurrency(currencyMark) !== invoice.currency
  ) {
    throw new Error(
      `currency mark ${currencyMark} doesn't mean ${invoice.currency}`,
    );
  }

  return {
    format,
    layout,
    dateFormat: options.dateFormat ?? drawnDateFormat,
    amountStyle:
      options.amountStyle ??
      (layout === "bilingual" ? "fr" : format === "csv" ? "plain" : "en"),
    currencyMark,
    combinedTotal: options.combinedTotal ?? drawnCombined,
    taxIdStyle: options.taxIdStyle ?? drawnTaxIdStyle,
    show: {
      dueDate: true,
      vendorTaxId: true,
      provincialTaxId: true,
      subtotal: true,
      bank: true,
      remitTo: drawnRemitTo,
      ...options.show,
    },
  };
}

function layoutFormat(layout: Layout | undefined): SourceFormat | undefined {
  if (layout === undefined) return undefined;
  for (const [format, layouts] of Object.entries(LAYOUTS)) {
    if ((layouts as readonly string[]).includes(layout))
      return format as SourceFormat;
  }
  return undefined;
}

/** SPEC §3: `$`, `C$`, `CAD`, `CDN` are CAD; `US$`, `USD` are USD. */
export function markCurrency(mark: CurrencyMark): "CAD" | "USD" {
  return mark === "US$" || mark === "USD" ? "USD" : "CAD";
}

const isSymbol = (mark: CurrencyMark | null) =>
  mark === "$" || mark === "C$" || mark === "US$";

/** Every string a renderer prints for the values in the expected file, so all renderers print them the same way. */
export type Printed = {
  invoiceNumber: string;
  invoiceDate: string;
  /** `null` when the due date isn't printed (terms still are). */
  dueDate: string | null;
  terms: string;
  poNumber: string;
  customerId: string;
  vendorName: string;
  vendorAddress: string[];
  vendorPhone: string;
  vendorEmail: string;
  vendorContact: string;
  gstNumber: string | null;
  provincialTaxId: { kind: "QST" | "PST" | "RST"; value: string } | null;
  customerName: string;
  attn: string;
  customerAddress: string[];
  customerEmail: string;
  shipTo: { name: string; address: string[] } | null;
  bank: string | null;
  remitTo: string | null;
  /** `Currency: CAD` when the mark is a code; `null` otherwise. */
  currencyNote: string | null;
  lines: {
    sku: string;
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
  }[];
  subtotal: string | null;
  shipping: string | null;
  taxes: { kind: TaxKind; rate: string; amount: string }[];
  total: string;
  /** Printed as a negative amount. */
  deposit: string | null;
  amountDue: string;
  /** One "Total Due" line feeds both `total` and `amountDue` (decision #29). */
  combinedTotal: boolean;
  footer: string;
};

export const FOOTER =
  "Synthetic test document. Fictional company and data, generated for software testing.";

export function printInvoice(invoice: Invoice, style: Style): Printed {
  const amount = (cents: number) => formatAmount(cents, style);
  const date = (iso: string) => formatDate(iso, style.dateFormat);
  const { show } = style;
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: date(invoice.invoiceDate),
    dueDate: show.dueDate ? date(invoice.dueDate) : null,
    terms: invoice.terms,
    poNumber: invoice.poNumber,
    customerId: invoice.customerId,
    vendorName:
      style.layout === "erp"
        ? invoice.vendor.name.toUpperCase()
        : invoice.vendor.name,
    vendorAddress: addressLines(invoice.vendor.address),
    vendorPhone: invoice.vendor.phone,
    vendorEmail: invoice.vendor.email,
    vendorContact: invoice.vendor.contact,
    gstNumber: show.vendorTaxId
      ? formatGstNumber(invoice.vendor.gstNumber, style.taxIdStyle)
      : null,
    provincialTaxId: show.provincialTaxId
      ? invoice.vendor.provincialTaxId
      : null,
    customerName: invoice.customer.name,
    attn: invoice.customer.attn,
    customerAddress: addressLines(invoice.customer.address),
    customerEmail: invoice.customer.email,
    shipTo:
      invoice.shipTo === null
        ? null
        : {
            name: invoice.shipTo.name,
            address: addressLines(invoice.shipTo.address),
          },
    bank: show.bank ? invoice.vendor.bank : null,
    remitTo: show.remitTo ? invoice.vendor.remitTo : null,
    currencyNote:
      style.currencyMark !== null && !isSymbol(style.currencyMark)
        ? `Currency: ${style.currencyMark}`
        : null,
    lines: invoice.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: amount(l.unitPrice),
      amount: amount(l.amount),
    })),
    subtotal: show.subtotal ? amount(invoice.subtotal) : null,
    shipping: invoice.shipping > 0 ? amount(invoice.shipping) : null,
    taxes: invoice.taxes.map((t) => ({
      kind: t.kind,
      rate: formatRate(t.rate, style.amountStyle),
      amount: amount(t.amount),
    })),
    total: amount(invoice.total),
    deposit: invoice.deposit > 0 ? amount(-invoice.deposit) : null,
    amountDue: amount(invoice.amountDue),
    combinedTotal: invoice.deposit === 0 && style.combinedTotal,
    footer: FOOTER,
  };
}

function addressLines(a: Address): string[] {
  return [a.street, `${a.city}, ${a.province} ${a.postalCode}`];
}

/**
 * Formats cents in an amount style, with the currency symbol if the mark is one.
 * French amounts group with U+202F in text files and U+00A0 elsewhere: the PDF
 * standard fonts can't encode U+202F.
 */
export function formatAmount(
  cents: number,
  style: Pick<Style, "amountStyle" | "currencyMark" | "format">,
): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100));
  const fraction = String(abs % 100).padStart(2, "0");
  const symbol = isSymbol(style.currencyMark) ? style.currencyMark : "";
  switch (style.amountStyle) {
    case "en":
      return `${sign}${symbol}${group(whole, ",")}.${fraction}`;
    case "plain":
      return `${sign}${symbol}${whole}.${fraction}`;
    case "fr": {
      const space = style.format === "txt" ? " " : " ";
      const suffix = symbol === "" ? "" : `${space}${symbol}`;
      return `${sign}${group(whole, space)},${fraction}${suffix}`;
    }
  }
}

function group(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+$)/gu, separator);
}

/** A tax rate in thousandths of a percent as printed: 5000 → `5`, 9975 → `9.975` (`9,975` in French style). */
export function formatRate(rate: number, amountStyle: AmountStyle): string {
  const text = String(rate / 1000);
  return amountStyle === "fr" ? text.replace(".", ",") : text;
}

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function formatDate(iso: string, format: DateFormat): string {
  const [y = "", m = "", d = ""] = iso.split("-");
  const month = Number(m) - 1;
  const day = Number(d);
  const en = MONTHS_EN[month] ?? "";
  switch (format) {
    case "iso":
      return iso;
    case "long":
      return `${en} ${String(day)}, ${y}`;
    case "short":
      return `${en.slice(0, 3)} ${String(day)}, ${y}`;
    case "dmy-abbr":
      return `${d}-${en.slice(0, 3)}-${y}`;
    case "mdy":
      return `${m}/${d}/${y}`;
    case "dmy":
      return `${d}/${m}/${y}`;
    case "fr":
      return `${day === 1 ? "1er" : String(day)} ${MONTHS_FR[month] ?? ""} ${y}`;
  }
}

/** `814273390RT0001` in a printed style. */
export function formatGstNumber(normalised: string, style: TaxIdStyle): string {
  const bn = normalised.slice(0, 9);
  const program = normalised.slice(9);
  switch (style) {
    case "grouped":
      return `${bn.slice(0, 5)} ${bn.slice(5)} ${program}`;
    case "spaced":
      return `${bn} ${program}`;
    case "compact":
      return normalised;
  }
}
