import { EN_LABELS, totalRows } from "./labels.ts";
import type { Printed } from "./print.ts";

/**
 * An accounting-system export: `lines` has one row per line item with the
 * invoice columns repeated, `summary` one row with no line items. Columns for
 * elements that aren't printed are left out. CRLF line endings (RFC 4180).
 */
export function renderCsv(
  printed: Printed,
  layout: "lines" | "summary",
): string {
  const p = printed;
  const head: [string, string][] = [
    ["Invoice Number", p.invoiceNumber],
    ["Invoice Date", p.invoiceDate],
  ];
  if (p.dueDate !== null) head.push(["Due Date", p.dueDate]);
  head.push(
    ["Terms", p.terms],
    ["PO Number", p.poNumber],
    ["Customer ID", p.customerId],
    ["Vendor", p.vendorName],
    ["Vendor Address", p.vendorAddress.join(", ")],
    ["Vendor Phone", p.vendorPhone],
  );
  if (p.gstNumber !== null) head.push(["Vendor GST/HST Number", p.gstNumber]);
  if (p.provincialTaxId !== null) {
    head.push([
      `Vendor ${p.provincialTaxId.kind} Number`,
      p.provincialTaxId.value,
    ]);
  }
  head.push(
    ["Bill To", p.customerName],
    ["Attn", p.attn],
    ["Bill To Address", p.customerAddress.join(", ")],
  );
  if (p.shipTo !== null) {
    head.push(
      ["Ship To", p.shipTo.name],
      ["Ship To Address", p.shipTo.address.join(", ")],
    );
  }
  // Rendered by ingest as `Currency: CAD`, the expected quote (decision #46)
  if (p.currencyNote !== null)
    head.push(["Currency", p.currencyNote.replace("Currency: ", "")]);

  const tail: [string, string][] = totalRows(p, EN_LABELS).map((t) => [
    t.label,
    t.amount,
  ]);
  if (p.bank !== null) tail.push(["Bank", p.bank]);
  if (p.remitTo !== null) tail.push(["Remit To", p.remitTo]);
  tail.push(["Note", p.footer]);

  const rows: [string, string][][] =
    layout === "summary"
      ? [[...head, ...tail]]
      : p.lines.map((line, i) => [
          ...head,
          ["Line", String(i + 1)],
          ["SKU", line.sku],
          ["Description", line.description],
          ["Qty", line.quantity],
          ["Unit Price", line.unitPrice],
          ["Line Amount", line.amount],
          ...tail,
        ]);

  const header = (rows[0] ?? []).map(([label]) => label);
  return [header, ...rows.map((r) => r.map(([, value]) => value))]
    .map((cells) => cells.map(csvCell).join(",") + "\r\n")
    .join("");
}

function csvCell(value: string): string {
  return /[",\r\n]|^\s|\s$/u.test(value)
    ? `"${value.replace(/"/gu, '""')}"`
    : value;
}
