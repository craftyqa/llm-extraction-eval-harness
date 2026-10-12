import { describe, expect, it } from "vitest";
import { checkRules, failedRules } from "./rules.ts";

describe("XF-1 subtotal + taxAmount == total, within ±0.01", () => {
  const xf1 = (subtotal: string, taxAmount: string, total: string) =>
    checkRules({ subtotal, taxAmount, total })["XF-1"];

  it.each([
    ["100.00", "13.00", "113.00", "pass"],
    ["100.00", "13.00", "113.01", "pass"],
    ["100.00", "13.00", "112.99", "pass"],
    ["100.00", "13.00", "113.02", "fail"],
    ["100.00", "13.00", "112.98", "fail"],
    ["100.00", "0.00", "100.00", "pass"],
    ["10000000.00", "1300000.00", "11300000.01", "pass"],
  ] as const)("%s + %s vs %s → %s", (subtotal, tax, total, expected) => {
    expect(xf1(subtotal, tax, total)).toBe(expected);
  });

  it("is skipped unless all three fields are found", () => {
    expect(checkRules({ subtotal: "1.00", total: "9.00" })["XF-1"]).toBe(
      "skipped",
    );
  });
});

describe("XF-2 dueDate >= invoiceDate", () => {
  it.each([
    ["2026-03-01", "2026-03-31", "pass"],
    ["2026-03-01", "2026-03-01", "pass"],
    ["2026-03-01", "2026-02-28", "fail"],
  ] as const)("%s → %s: %s", (invoiceDate, dueDate, expected) => {
    expect(checkRules({ invoiceDate, dueDate })["XF-2"]).toBe(expected);
  });

  it("is skipped without a due date", () => {
    expect(checkRules({ invoiceDate: "2026-03-01" })["XF-2"]).toBe("skipped");
  });
});

describe("FMT rules", () => {
  it.each([
    ["1999-12-31", "fail"],
    ["2000-01-01", "pass"],
    ["2099-12-31", "pass"],
    ["2100-01-01", "fail"],
  ] as const)("FMT-1 %s → %s", (invoiceDate, expected) => {
    expect(checkRules({ invoiceDate })["FMT-1"]).toBe(expected);
  });

  it("FMT-1 checks the due date too", () => {
    expect(
      checkRules({ invoiceDate: "2026-01-01", dueDate: "2100-01-01" })["FMT-1"],
    ).toBe("fail");
  });

  it.each([
    ["CAD", "pass"],
    ["USD", "pass"],
    ["EUR", "fail"],
  ] as const)("FMT-2 %s → %s", (currency, expected) => {
    expect(checkRules({ currency })["FMT-2"]).toBe(expected);
  });

  it.each([
    ["814273390RT0001", "pass"],
    ["81427 3390 RT0001", "fail"],
    ["1218843307TQ0001", "fail"],
    ["814273390RT001", "fail"],
  ] as const)("FMT-3 %s → %s", (vendorTaxId, expected) => {
    expect(checkRules({ vendorTaxId })["FMT-3"]).toBe(expected);
  });
});

it("failedRules lists only failures", () => {
  expect(failedRules({})).toEqual([]);
  expect(
    failedRules({
      subtotal: "1.00",
      taxAmount: "0.00",
      total: "2.00",
      currency: "EUR",
    }),
  ).toEqual(["XF-1", "FMT-2"]);
});
