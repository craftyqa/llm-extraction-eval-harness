import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatCents,
  normaliseAmount,
  normaliseCurrency,
  normaliseDate,
  normaliseInvoiceNumber,
  normaliseName,
  normaliseTaxId,
  toCents,
} from "./normalise.ts";

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const MINUS = String.fromCharCode(0x2212);

describe("normaliseAmount", () => {
  // Every example in SPEC §4, then edge cases
  it.each([
    ["$1,290.65", "1290.65"],
    ["1 234,50 $", "1234.50"],
    ["€ 4.250,90", "4250.90"],
    [`${MINUS}$612.44`, "-612.44"],
    ["1,234", "1234.00"],
    ["$500", "500.00"],
    ["1 234 $", "1234.00"],
    [`1${NBSP}234,50${NBSP}$`, "1234.50"],
    [`1${NNBSP}234,50 $`, "1234.50"],
    ["(612.44)", "-612.44"],
    ["-$612.44", "-612.44"],
    ["CAD 1,234.50", "1234.50"],
    ["CAD1,234.50", "1234.50"],
    ["US$ 99.99", "99.99"],
    ["C$2,546.00", "2546.00"],
    ["1.234.567,89", "1234567.89"],
    ["1.000.000", "1000000.00"],
    ["0.00", "0.00"],
    ["007.50", "7.50"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseAmount(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["$1.5", "500 CR", "", "$", "1,2345", ".50", "12.3.4", "N/A"])(
    "%s is unparseable",
    (raw) => {
      expect(normaliseAmount(raw)).toEqual({
        ok: false,
        reason: "unparseable",
      });
    },
  );

  it("round-trips every supported format (R-4)", () => {
    const styles = {
      en: (whole: string, cents: string) =>
        `$${whole.replace(/\B(?=(\d{3})+$)/gu, ",")}.${cents}`,
      fr: (whole: string, cents: string) =>
        `${whole.replace(/\B(?=(\d{3})+$)/gu, NNBSP)},${cents}${NBSP}$`,
      eu: (whole: string, cents: string) =>
        `${whole.replace(/\B(?=(\d{3})+$)/gu, ".")},${cents}`,
      plain: (whole: string, cents: string) => `${whole}.${cents}`,
    };
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.constantFrom(...Object.values(styles)),
        (cents, style) => {
          const whole = String(cents / 100n);
          const fraction = String(cents % 100n).padStart(2, "0");
          expect(normaliseAmount(style(whole, fraction))).toEqual({
            ok: true,
            value: formatCents(cents),
          });
        },
      ),
    );
  });
});

describe("formatCents / toCents", () => {
  it.each([
    [0n, "0.00"],
    [5n, "0.05"],
    [123456n, "1234.56"],
    [-61244n, "-612.44"],
  ])("%s ↔ %s", (cents, amount) => {
    expect(formatCents(cents)).toBe(amount);
    expect(toCents(amount)).toBe(cents);
  });
});

describe("normaliseDate", () => {
  it.each([
    ["2026-03-04", "2026-03-04"],
    ["March 4, 2026", "2026-03-04"],
    ["4 mars 2026", "2026-03-04"],
    ["08-Sep-2026", "2026-09-08"],
    ["1er mars 2026", "2026-03-01"],
    ["March 1st, 2026", "2026-03-01"],
    ["Sept. 8, 2026", "2026-09-08"],
    ["Sep 8 2026", "2026-09-08"],
    ["févr. 3 2026", "2026-02-03"],
    ["3 fevrier 2026", "2026-02-03"],
    ["15 aout 2026", "2026-08-15"],
    ["1 décembre 2026", "2026-12-01"],
    ["22nd October 2026", "2026-10-22"],
    ["13/04/2026", "2026-04-13"],
    ["04/13/2026", "2026-04-13"],
    ["31.12.2026", "2026-12-31"],
    ["05-05-2026", "2026-05-05"],
    ["29/02/2028", "2028-02-29"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseDate(raw, "")).toEqual({ ok: true, value: expected });
  });

  describe("NN/NN/YYYY with both parts ≤ 12", () => {
    it("is ambiguous with no other date to decide it", () => {
      expect(normaliseDate("03/04/2026", "Date: 03/04/2026")).toEqual({
        ok: false,
        reason: "ambiguous",
      });
    });

    it("takes the order from another date in the same format", () => {
      expect(
        normaliseDate("03/04/2026", "Date 03/04/2026 Due 15/04/2026"),
      ).toEqual({
        ok: true,
        value: "2026-04-03",
      });
      expect(
        normaliseDate("03/04/2026", "Date 03/04/2026 Due 04/15/2026"),
      ).toEqual({
        ok: true,
        value: "2026-03-04",
      });
    });

    it.each([
      ["a written-month date", "Date 03/04/2026 Due April 15, 2026"],
      ["an ISO date", "Date 03/04/2026 Due 2026-04-15"],
      ["a different separator", "Date 03/04/2026 Due 15-04-2026"],
      ["dates that disagree", "03/04/2026 15/04/2026 04/16/2026"],
      [
        "payment terms",
        "Date 03/04/2026 Net 30 (due 30 days after 03/04/2026)",
      ],
    ])("isn't decided by %s", (_why, source) => {
      expect(normaliseDate("03/04/2026", source)).toEqual({
        ok: false,
        reason: "ambiguous",
      });
    });
  });

  it.each(["03/04/26", "4 Mar 26"])(
    "%s (two-digit year) is ambiguous",
    (raw) => {
      expect(normaliseDate(raw, "")).toEqual({
        ok: false,
        reason: "ambiguous",
      });
    },
  );

  it.each([
    "2026-02-30",
    "29/02/2026",
    "31/04/2026",
    "Tuesday, March 4, 2026",
    "Smarch 4, 2026",
    "Net 30",
    "",
  ])("%s is unparseable", (raw) => {
    expect(normaliseDate(raw, "")).toEqual({
      ok: false,
      reason: "unparseable",
    });
  });
});

describe("normaliseInvoiceNumber", () => {
  it.each([
    ["INV-2026-04817", "INV-2026-04817"],
    ["  0418823 ", "0418823"],
    ["Invoice # INV-1", "INV-1"],
    ["Invoice No. 0418823", "0418823"],
    ["No.12345", "12345"],
    ["N° 2026-118", "2026-118"],
    ["Facture / Invoice No. 0418823", "0418823"],
    ["#12345", "12345"],
    ["Invoice: A-77", "A-77"],
    ["NO-555", "NO-555"],
    ["BILL/2026/1", "BILL/2026/1"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseInvoiceNumber(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["Invoice", "  ", "Invoice #"])("%s is unparseable", (raw) => {
    expect(normaliseInvoiceNumber(raw)).toEqual({
      ok: false,
      reason: "unparseable",
    });
  });
});

describe("normaliseTaxId", () => {
  it.each([
    ["70219 8841 RT0001", "702198841RT0001"],
    ["123-456-789-RT-0001", "123456789RT0001"],
    ["123456789RT0001", "123456789RT0001"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseTaxId(raw)).toEqual({ ok: true, value: expected });
  });
});

describe("normaliseCurrency", () => {
  it.each([
    ["$", "CAD"],
    ["C$", "CAD"],
    ["CAD", "CAD"],
    ["cdn", "CAD"],
    ["US$", "USD"],
    ["USD", "USD"],
    ["US funds", "USD"],
    [" us  FUNDS ", "USD"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseCurrency(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["€", "EUR", "", "dollars"])("%s is unparseable", (raw) => {
    expect(normaliseCurrency(raw)).toEqual({
      ok: false,
      reason: "unparseable",
    });
  });
});

describe("normaliseName", () => {
  it("keeps the name as printed, trimmed", () => {
    expect(normaliseName("  KEYSTONE PACKAGING DISTRIBUTORS LTD. ")).toEqual({
      ok: true,
      value: "KEYSTONE PACKAGING DISTRIBUTORS LTD.",
    });
  });
});
