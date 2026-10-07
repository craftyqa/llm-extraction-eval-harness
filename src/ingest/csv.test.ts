import { describe, expect, it } from "vitest";
import { csvToText } from "./csv.ts";

describe("csvToText", () => {
  it("renders each value next to its header", () => {
    const csv =
      "Invoice Number,Invoice Date,Total\nINV-1001,2026-04-02,1130.00\n";
    const text = csvToText(csv);
    expect(text).toContain("Invoice Number: INV-1001");
    expect(text).toContain("Invoice Date: 2026-04-02");
    expect(text).toContain("Total: 1130.00");
  });

  it("keeps quoted values with commas intact", () => {
    const csv = 'Vendor,Total\n"Northwind Supply, Inc.","1,130.00"\n';
    const text = csvToText(csv);
    expect(text).toContain("Vendor: Northwind Supply, Inc.");
    expect(text).toContain("Total: 1,130.00");
  });

  it("renders every row", () => {
    const csv = "Item,Amount\nWidgets,100.00\nBolts,25.50\n";
    const text = csvToText(csv);
    expect(text).toContain("Item: Widgets");
    expect(text).toContain("Item: Bolts");
  });

  it.todo("separates rows (decide the separator: blank line, row heading, …)");
  it.todo("handles a BOM, CRLF line endings and blank values");
});
