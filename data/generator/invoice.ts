import type { Faker } from "@faker-js/faker";
import {
  BANK_KINDS,
  CITY_SUFFIXES,
  CUSTOMER_TRADES,
  LEGAL_FORMS,
  PLACE_WORDS,
  SHIP_TO_SITES,
  STREET_TYPES,
  TRADES,
} from "./words.ts";

export const PROVINCES = [
  "BC",
  "AB",
  "SK",
  "MB",
  "ON",
  "QC",
  "NB",
  "NS",
  "PE",
  "NL",
  "YT",
  "NT",
  "NU",
] as const;
export type Province = (typeof PROVINCES)[number];

export type TaxKind = "GST" | "HST" | "PST" | "QST" | "RST";

/** A sales tax and its rate in thousandths of a percent (5% = 5000, QST 9.975% = 9975). */
export type TaxRate = { kind: TaxKind; rate: number };

/** Sales taxes by province of supply, as of 2026. */
const PROVINCE_TAXES: Record<Province, readonly TaxRate[]> = {
  BC: [
    { kind: "GST", rate: 5000 },
    { kind: "PST", rate: 7000 },
  ],
  AB: [{ kind: "GST", rate: 5000 }],
  SK: [
    { kind: "GST", rate: 5000 },
    { kind: "PST", rate: 6000 },
  ],
  MB: [
    { kind: "GST", rate: 5000 },
    { kind: "RST", rate: 7000 },
  ],
  ON: [{ kind: "HST", rate: 13000 }],
  QC: [
    { kind: "GST", rate: 5000 },
    { kind: "QST", rate: 9975 },
  ],
  NB: [{ kind: "HST", rate: 15000 }],
  NS: [{ kind: "HST", rate: 14000 }],
  PE: [{ kind: "HST", rate: 15000 }],
  NL: [{ kind: "HST", rate: 15000 }],
  YT: [{ kind: "GST", rate: 5000 }],
  NT: [{ kind: "GST", rate: 5000 }],
  NU: [{ kind: "GST", rate: 5000 }],
};

/** First letters of postal codes by province (Canada Post forward sortation areas). */
const POSTAL_PREFIXES: Record<Province, string> = {
  BC: "V",
  AB: "T",
  SK: "S",
  MB: "R",
  ON: "KLMNP",
  QC: "GHJ",
  NB: "E",
  NS: "B",
  PE: "C",
  NL: "A",
  YT: "Y",
  NT: "X",
  NU: "X",
};

const AREA_CODES: Record<Province, readonly string[]> = {
  BC: ["250", "604"],
  AB: ["403", "780"],
  SK: ["306"],
  MB: ["204"],
  ON: ["416", "519", "613", "705"],
  QC: ["418", "514", "819"],
  NB: ["506"],
  NS: ["902"],
  PE: ["902"],
  NL: ["709"],
  YT: ["867"],
  NT: ["867"],
  NU: ["867"],
};

export type Address = {
  street: string;
  city: string;
  province: Province;
  postalCode: string;
};

export type Vendor = {
  name: string;
  /** For the `email` layout's sign-off. */
  contact: string;
  address: Address;
  /** Fictional: the exchange is 555-01XX, reserved for fiction. */
  phone: string;
  /** On the reserved `.example` domain. */
  email: string;
  /** GST/HST registration, normalised: 9 digits + `RT` + 4 digits. */
  gstNumber: string;
  /** QST, PST or RST registration, as printed; `null` where the province has none. */
  provincialTaxId: { kind: "QST" | "PST" | "RST"; value: string } | null;
  bank: string;
  /** Remit-to party: the vendor's own name plus a lockbox. */
  remitTo: string;
};

export type Customer = {
  name: string;
  /** Contact person on the bill-to block (a `customerName` decoy). */
  attn: string;
  address: Address;
  email: string;
};

export type LineItem = {
  sku: string;
  description: string;
  quantity: number;
  /** Cents. */
  unitPrice: number;
  /** Cents; `quantity × unitPrice`. */
  amount: number;
};

export type TaxLine = TaxRate & { amount: number };

/**
 * The facts of one invoice: the ground truth the expected file is built from.
 * Amounts are integer cents. Dates are `YYYY-MM-DD`.
 */
export type Invoice = {
  invoiceNumber: string;
  poNumber: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  /** Payment terms as printed, e.g. `Net 30`. */
  terms: string;
  vendor: Vendor;
  customer: Customer;
  /** A ship-to site of the customer, or `null` when the goods go to the bill-to address. */
  shipTo: { name: string; address: Address } | null;
  currency: "CAD" | "USD";
  lines: LineItem[];
  subtotal: number;
  /** 0 when there is no shipping line. */
  shipping: number;
  /** Empty when the invoice has no tax line. */
  taxes: TaxLine[];
  /** Printed total; equals subtotal + shipping + taxes unless `totalAdjustCents` is set. */
  total: number;
  /** 0 when there is no deposit. */
  deposit: number;
  amountDue: number;
};

/** Options that change the facts. Every option is drawn from the seed when not given. */
export type InvoiceOptions = {
  vendorProvince?: Province;
  customerProvince?: Province;
  currency?: "CAD" | "USD";
  /** Number of line items. */
  lineCount?: number;
  /** Multiplies every unit price, for very large amounts. A positive integer. */
  priceScale?: number;
  shipping?: boolean;
  deposit?: boolean;
  /** `province`: the customer's provincial taxes; `zero`: one explicit 0% GST line; `none`: no tax line. */
  tax?: "province" | "zero" | "none";
  /** Days from the invoice date to the due date; 0 is due on receipt. */
  dueDays?: number;
  /** An invoice date to use instead of one drawn from the seed. */
  invoiceDate?: string;
  shipTo?: boolean;
  /** Added to the computed total, e.g. 1 for a total off by a cent. */
  totalAdjustCents?: number;
};

/**
 * Draws an invoice from `faker`. Every random draw happens in the same order
 * whatever the options, and an option replaces its draw instead of skipping it,
 * so changing one option leaves the rest of the invoice unchanged.
 */
export function generateInvoice(
  faker: Faker,
  options: InvoiceOptions = {},
): Invoice {
  const pick = <T>(items: readonly T[]): T => faker.helpers.arrayElement(items);
  const int = (min: number, max: number) => faker.number.int({ min, max });
  const chance = (probability: number) => faker.datatype.boolean(probability);

  const vendorProvince = options.vendorProvince ?? pick(PROVINCES);
  const sameProvince = chance(0.7);
  const customerProvince =
    options.customerProvince ??
    (sameProvince ? vendorProvince : pick(PROVINCES));

  // Vendor
  const trade = pick(TRADES);
  const vendorWord = pick(PLACE_WORDS);
  const vendorName = `${vendorWord} ${trade.name} ${pick(LEGAL_FORMS)}`;
  const vendorSlug = vendorWord.toLowerCase().replace(/[^a-z]/gu, "");
  const vendorAddress = drawAddress(faker, vendorProvince);
  const gstNumber =
    drawBusinessNumber(faker) + `RT000${String(pick([1, 1, 1, 2]))}`;
  const provincialTaxId = drawProvincialTaxId(faker, vendorProvince);
  const lockbox = String(int(1000, 9999));
  const vendor: Vendor = {
    name: vendorName,
    contact: `${faker.person.firstName()} ${faker.person.lastName()}`,
    address: vendorAddress,
    phone: `(${pick(AREA_CODES[vendorProvince])}) 555-01${String(int(0, 99)).padStart(2, "0")}`,
    email: `ar@${vendorSlug}.example`,
    gstNumber,
    provincialTaxId,
    bank:
      vendorProvince === "QC"
        ? `Caisse populaire ${pick(PLACE_WORDS)}`
        : `${pick(PLACE_WORDS)} ${pick(BANK_KINDS)}`,
    remitTo: `${vendorName} — Lockbox ${lockbox}`,
  };

  // Customer
  const customerWord = pick(PLACE_WORDS.filter((w) => w !== vendorWord));
  const customerBase = `${customerWord} ${pick(CUSTOMER_TRADES)}`;
  const customer: Customer = {
    name: `${customerBase} ${pick(LEGAL_FORMS)}`,
    attn: `${faker.person.firstName()} ${faker.person.lastName()}`,
    address: drawAddress(faker, customerProvince),
    email: `ap@${customerWord.toLowerCase().replace(/[^a-z]/gu, "")}.example`,
  };
  const shipToDrawn = chance(0.4);
  const shipToSite = pick(SHIP_TO_SITES);
  const shipToAddress = drawAddress(faker, customerProvince);
  const shipTo =
    (options.shipTo ?? shipToDrawn)
      ? { name: `${customerBase} — ${shipToSite}`, address: shipToAddress }
      : null;

  // Numbers
  const invoiceNumber = drawInvoiceNumber(faker);
  const poNumber = pick([
    `PO-${String(int(10000, 99999))}`,
    `${String(int(1000, 9999))}-${faker.string.alpha({ length: 2, casing: "upper" })}`,
    `P${String(int(100000, 999999))}`,
  ]);
  const customerId = pick([
    `C-${String(int(0, 99999)).padStart(5, "0")}`,
    `${customerWord.slice(0, 3).toUpperCase()}${String(int(1, 999)).padStart(3, "0")}`,
  ]);

  // Dates
  const drawnDate = addDays("2026-01-01", int(0, 364));
  const invoiceDate = options.invoiceDate ?? drawnDate;
  const drawnDueDays = pick([15, 30, 30, 30, 45, 60]);
  const dueDays = options.dueDays ?? drawnDueDays;
  const terms = dueDays === 0 ? "Due on receipt" : `Net ${String(dueDays)}`;

  // Lines
  const drawnLineCount = int(2, 7);
  const lineCount = options.lineCount ?? drawnLineCount;
  const priceScale = options.priceScale ?? 1;
  const lines: LineItem[] = [];
  for (let i = 0; i < lineCount; i++) {
    const item = pick(trade.items);
    const quantity = int(item.qty[0], item.qty[1]);
    const unitPrice =
      (int(item.price[0] * 100, item.price[1] * 100) - int(0, 99)) * priceScale;
    lines.push({
      sku: `${trade.sku}-${String(int(1000, 9999))}`,
      description: item.description,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
    });
  }
  const subtotal = sum(lines.map((l) => l.amount));

  // Charges
  const shippingDrawn = chance(0.3);
  const shippingAmount = int(15, 150) * 100 + pick([0, 0, 50, 95]);
  const shipping = (options.shipping ?? shippingDrawn) ? shippingAmount : 0;

  const taxMode = options.tax ?? "province";
  const rates: readonly TaxRate[] =
    taxMode === "province"
      ? PROVINCE_TAXES[customerProvince]
      : taxMode === "zero"
        ? [{ kind: "GST", rate: 0 }]
        : [];
  const taxBase = subtotal + shipping;
  const taxes = rates.map((r) => ({ ...r, amount: taxOn(taxBase, r.rate) }));
  const total =
    taxBase + sum(taxes.map((t) => t.amount)) + (options.totalAdjustCents ?? 0);

  const depositDrawn = chance(0.15);
  const depositShare = int(10, 40);
  // A share of the total in whole dollars
  const deposit =
    (options.deposit ?? depositDrawn)
      ? Math.floor((total * depositShare) / 100 / 100) * 100
      : 0;

  const drawnCurrency = chance(0.15) ? "USD" : "CAD";

  if (!Number.isSafeInteger(taxBase * 15000)) {
    throw new RangeError(
      `amounts too large for exact tax arithmetic: ${String(taxBase)} cents`,
    );
  }

  return {
    invoiceNumber,
    poNumber,
    customerId,
    invoiceDate,
    dueDate: addDays(invoiceDate, dueDays),
    terms,
    vendor,
    customer,
    shipTo,
    currency: options.currency ?? drawnCurrency,
    lines,
    subtotal,
    shipping,
    taxes,
    total,
    deposit,
    amountDue: total - deposit,
  };
}

/** Tax on `base` cents at `rate` thousandths of a percent, rounded half up to the cent. */
export function taxOn(base: number, rate: number): number {
  return Math.floor((base * rate + 50_000) / 100_000);
}

export function addDays(isoDate: string, days: number): string {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function drawAddress(faker: Faker, province: Province): Address {
  const pick = <T>(items: readonly T[]): T => faker.helpers.arrayElement(items);
  const number = String(faker.number.int({ min: 1, max: 2999 }));
  const name = faker.person.lastName();
  const streetType = pick(STREET_TYPES);
  const street =
    province === "QC"
      ? `${number}, rue ${name}`
      : `${number} ${name} ${streetType}`;
  const city = `${pick(PLACE_WORDS)} ${pick(CITY_SUFFIXES)}`;
  // Letters Canada Post never uses in postal codes are left out.
  const letter = () => faker.string.fromCharacters("ABCEGHJKLMNPRSTVWXYZ");
  const digit = () => String(faker.number.int(9));
  const postalCode = `${faker.string.fromCharacters(POSTAL_PREFIXES[province])}${digit()}${letter()} ${digit()}${letter()}${digit()}`;
  return { street, city, province, postalCode };
}

/**
 * A 9-digit business number whose Luhn check digit is wrong, so it can't be a
 * real CRA registration (the BN check digit is a Luhn digit).
 */
export function drawBusinessNumber(faker: Faker): string {
  const body = faker.string.numeric({ length: 8, allowLeadingZeros: false });
  const valid = luhnCheckDigit(body);
  const offset = faker.number.int({ min: 1, max: 9 });
  return body + String((valid + offset) % 10);
}

/** The Luhn check digit for `digits`. */
export function luhnCheckDigit(digits: string): number {
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return (10 - (total % 10)) % 10;
}

function drawProvincialTaxId(
  faker: Faker,
  province: Province,
): Vendor["provincialTaxId"] {
  const digits = (length: number) =>
    faker.string.numeric({ length, allowLeadingZeros: false });
  switch (province) {
    case "QC":
      return { kind: "QST", value: `${digits(10)} TQ0001` };
    case "BC":
      return { kind: "PST", value: `PST-${digits(4)}-${digits(4)}` };
    case "SK":
      return { kind: "PST", value: digits(7) };
    case "MB":
      return { kind: "RST", value: `${digits(6)}-${digits(1)}` };
    default:
      return null;
  }
}

function drawInvoiceNumber(faker: Faker): string {
  const n = (min: number, max: number) =>
    String(faker.number.int({ min, max }));
  const letters = faker.string.alpha({ length: 2, casing: "upper" });
  return faker.helpers.arrayElement([
    `INV-2026-${n(1, 99999).padStart(5, "0")}`,
    n(1, 9999999).padStart(7, "0"),
    `${letters}-26-${n(100, 999)}`,
    `A${n(10000, 99999)}`,
    `2026-${n(1, 9999).padStart(4, "0")}`,
  ]);
}
