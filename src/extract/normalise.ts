import type { FieldKind } from "./fields.ts";

/** A normalised value, or why there isn't one (SPEC §4). */
export type Normalised =
  | { ok: true; value: string }
  | { ok: false; reason: "ambiguous" | "unparseable" };

const ok = (value: string): Normalised => ({ ok: true, value });
const unparseable: Normalised = { ok: false, reason: "unparseable" };
const ambiguous: Normalised = { ok: false, reason: "ambiguous" };

/** Normalises one raw value for a field kind. `source` is the ingested text, used to disambiguate dates. */
export function normalise(
  kind: FieldKind,
  raw: string,
  source: string,
): Normalised {
  switch (kind) {
    case "amount":
      return normaliseAmount(raw);
    case "date":
      return normaliseDate(raw, source);
    case "invoiceNumber":
      return normaliseInvoiceNumber(raw);
    case "taxId":
      return normaliseTaxId(raw);
    case "currency":
      return normaliseCurrency(raw);
    case "name":
      return normaliseName(raw);
  }
}

// --- Amounts ---------------------------------------------------------------

const currencyMarks = /(?:US|CA|C)?\$|CAD|USD|CDN|EUR|GBP|[€£]/giu;

/** SPEC §4 amounts: a 2-dp decimal string, e.g. `1 234,50 $` → `1234.50`. */
export function normaliseAmount(raw: string): Normalised {
  let s = raw.replace(currencyMarks, "").replace(/\s/gu, "");
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  }

  let whole: string;
  let fraction = "00";
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (last === -1) {
    whole = s;
  } else {
    const after = s.slice(last + 1);
    const before = s.slice(0, last).replace(/[.,]/gu, "");
    if (/^\d{2}$/u.test(after)) {
      whole = before;
      fraction = after;
    } else if (/^\d{3}$/u.test(after)) {
      whole = before + after;
    } else {
      return unparseable;
    }
  }
  if (!/^\d+$/u.test(whole)) return unparseable;

  const cents = BigInt(whole) * 100n + BigInt(fraction);
  return ok(formatCents(negative ? -cents : cents));
}

/** Integer cents → 2-dp string. */
export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${String(abs / 100n)}.${String(abs % 100n).padStart(2, "0")}`;
}

/** 2-dp string → integer cents. */
export function toCents(amount: string): bigint {
  const [whole = "0", fraction = "00"] = amount.replace("-", "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  return amount.startsWith("-") ? -cents : cents;
}

// --- Dates -----------------------------------------------------------------

const MONTHS: Record<string, number> = {};
for (const [month, names] of [
  [1, "january jan janvier janv"],
  [2, "february feb fevrier fevr fev"],
  [3, "march mar mars"],
  [4, "april apr avril avr"],
  [5, "may mai"],
  [6, "june jun juin"],
  [7, "july jul juillet juil"],
  [8, "august aug aout"],
  [9, "september sep sept septembre"],
  [10, "october oct octobre"],
  [11, "november nov novembre"],
  [12, "december dec decembre"],
] as const) {
  for (const name of names.split(" ")) MONTHS[name] = month;
}

const ordinal = "(?:st|nd|rd|th|er)?";
const monthWord = "([a-z]+)\\.?";
const writtenPatterns = [
  // March 4, 2026 · Sept. 8 2026 · March 1st, 2026
  {
    re: new RegExp(`^${monthWord} (\\d{1,2})${ordinal} (\\d+)$`, "u"),
    d: 2,
    m: 1,
    y: 3,
  },
  // 4 mars 2026 · 1er mars 2026 · 08-Sep-2026
  {
    re: new RegExp(`^(\\d{1,2})${ordinal}[ ./-]${monthWord}[ ./-](\\d+)$`, "u"),
    d: 1,
    m: 2,
    y: 3,
  },
];

const numericDate = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/u;

/**
 * SPEC §4 dates: `YYYY-MM-DD`. A numeric `NN/NN/YYYY` with both parts ≤ 12 and
 * unequal is decided only by another date in `source` with the same separator
 * and a part > 12; otherwise it's `ambiguous`.
 */
export function normaliseDate(raw: string, source: string): Normalised {
  const s = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(s);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = numericDate.exec(s);
  if (numeric) {
    const [, first = "", separator = "", second = "", year = ""] = numeric;
    if (year.length === 2) return ambiguous;
    const a = Number(first);
    const b = Number(second);
    let order: "dm" | "md" | undefined;
    if (a > 12) order = "dm";
    else if (b > 12) order = "md";
    else if (a === b) order = "dm";
    else order = numericOrderIn(source, separator);
    if (order === undefined) return ambiguous;
    return order === "dm"
      ? calendarDate(Number(year), b, a)
      : calendarDate(Number(year), a, b);
  }

  const words = foldAccents(s)
    .toLowerCase()
    .replace(/,/gu, " ")
    .replace(/\s+/gu, " ");
  for (const { re, d, m, y } of writtenPatterns) {
    const match = re.exec(words);
    if (!match) continue;
    const month = MONTHS[match[m] ?? ""];
    const year = match[y] ?? "";
    if (month === undefined) return unparseable;
    if (year.length === 2) return ambiguous;
    if (year.length !== 4) return unparseable;
    return calendarDate(Number(year), month, Number(match[d]));
  }
  return unparseable;
}

/** The day/month order shown by other numeric dates in the source with this separator, if they agree. */
function numericOrderIn(
  source: string,
  separator: string,
): "dm" | "md" | undefined {
  const orders = new Set<"dm" | "md">();
  for (const [, first = "", sep, second = ""] of source.matchAll(
    /(?<![\d/.-])(\d{1,2})([/.-])(\d{1,2})\2\d{4}(?![\d/.-])/gu,
  )) {
    if (sep !== separator) continue;
    if (Number(first) > 12 && Number(second) <= 12) orders.add("dm");
    if (Number(second) > 12 && Number(first) <= 12) orders.add("md");
  }
  return orders.size === 1 ? [...orders][0] : undefined;
}

function calendarDate(year: number, month: number, day: number): Normalised {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return unparseable;
  }
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return ok(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
}

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

// --- Strings ---------------------------------------------------------------

/** Label words that may precede an invoice number; each must end at a separator. */
const invoiceLabel =
  /^(?:(?:invoice|bill|facture|number|num[eé]ro|no)\.?(?=[\s:#.]|$)|n[°º]|[#:/.])\s*/iu;

/** SPEC §4: strips label prefixes and surrounding whitespace. */
export function normaliseInvoiceNumber(raw: string): Normalised {
  let s = raw.trim();
  for (let previous = ""; s !== previous;) {
    previous = s;
    s = s.replace(invoiceLabel, "");
  }
  return s === "" ? unparseable : ok(s);
}

/** SPEC §4: removes spaces and dashes. */
export function normaliseTaxId(raw: string): Normalised {
  const s = raw.replace(/[\s-]/gu, "");
  return s === "" ? unparseable : ok(s);
}

const CURRENCIES: Record<string, "CAD" | "USD"> = {
  $: "CAD",
  C$: "CAD",
  CA$: "CAD",
  CAD: "CAD",
  CDN: "CAD",
  US$: "USD",
  USD: "USD",
  "US FUNDS": "USD",
};

/** SPEC §3: `$`, `C$`, `CAD`, `CDN` → CAD; `US$`, `USD`, "US funds" → USD; anything else is unparseable. */
export function normaliseCurrency(raw: string): Normalised {
  const currency = CURRENCIES[raw.trim().replace(/\s+/gu, " ").toUpperCase()];
  return currency === undefined ? unparseable : ok(currency);
}

/** SPEC §4: names are stored as printed; matching normalises them (§8). */
export function normaliseName(raw: string): Normalised {
  const s = raw.trim();
  return s === "" ? unparseable : ok(s);
}
