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

  it("separates rows with a blank line (decision #46)", () => {
    const csv = "Item,Amount\nWidgets,100.00\nBolts,25.50\n";
    expect(csvToText(csv)).toBe(
      "Item: Widgets\nAmount: 100.00\n\nItem: Bolts\nAmount: 25.50\n",
    );
  });

  it("renders a blank value as a bare label", () => {
    const csv = "Invoice Number,Due Date,Total\nINV-1001,,1130.00\n";
    expect(csvToText(csv)).toBe(
      "Invoice Number: INV-1001\nDue Date:\nTotal: 1130.00\n",
    );
  });

  it("labels cells beyond the header and pads short rows", () => {
    const csv = "Item,Amount\nWidgets,100.00,note\nBolts\n";
    expect(csvToText(csv)).toBe(
      "Item: Widgets\nAmount: 100.00\nColumn 3: note\n\nItem: Bolts\nAmount:\n",
    );
  });

  it("drops rows whose cells are all blank", () => {
    const csv = "Item,Amount\n,\nWidgets,100.00\n  ,  \n";
    expect(csvToText(csv)).toBe("Item: Widgets\nAmount: 100.00\n");
  });

  it("is empty for a header-only or whitespace-only CSV", () => {
    expect(csvToText("Item,Amount\n")).toBe("");
    expect(csvToText("  \n\t\n")).toBe("");
    expect(csvToText("")).toBe("");
  });

  it("throws on a CSV it can't parse", () => {
    expect(() => csvToText('Item,Amount\n"Widgets,100.00\n')).toThrow();
  });
});
