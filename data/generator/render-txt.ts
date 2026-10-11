import { EN_LABELS, totalRows } from "./labels.ts";
import type { Printed } from "./print.ts";

/** Plain text, UTF-8, `\n` line endings, ending with a newline. */
export function renderTxt(printed: Printed, layout: "plain" | "email"): string {
  const lines = layout === "plain" ? plainLines(printed) : emailLines(printed);
  return lines.join("\n") + "\n";
}

/** A fixed-width printout, like an accounting system's text export. */
function plainLines(p: Printed): string[] {
  const l = EN_LABELS;
  const out: string[] = [
    p.vendorName,
    ...p.vendorAddress,
    `Tel ${p.vendorPhone} · ${p.vendorEmail}`,
  ];
  if (p.gstNumber !== null) out.push(`GST/HST Reg. No.: ${p.gstNumber}`);
  if (p.provincialTaxId !== null) {
    out.push(`${p.provincialTaxId.kind} Reg. No.: ${p.provincialTaxId.value}`);
  }

  const field = (label: string, value: string) =>
    `${(label + ":").padEnd(16)}${value}`;
  out.push("", l.title, "");
  out.push(field("Invoice No.", p.invoiceNumber));
  out.push(field(l.invoiceDate, p.invoiceDate));
  if (p.dueDate !== null) out.push(field(l.dueDate, p.dueDate));
  out.push(field(l.terms, p.terms));
  out.push(field("PO No.", p.poNumber));
  out.push(field("Customer No.", p.customerId));
  if (p.currencyNote !== null) out.push(p.currencyNote);

  out.push("", "Bill To:", `  ${p.customerName}`, `  Attn: ${p.attn}`);
  out.push(...p.customerAddress.map((a) => `  ${a}`));
  if (p.shipTo !== null) {
    out.push(
      "",
      "Ship To:",
      `  ${p.shipTo.name}`,
      ...p.shipTo.address.map((a) => `  ${a}`),
    );
  }

  const row = (
    sku: string,
    desc: string,
    qty: string,
    unit: string,
    amount: string,
  ) =>
    `${sku.padEnd(9)} ${desc.padEnd(40)} ${qty.padStart(5)} ${unit.padStart(14)} ${amount.padStart(16)}`;
  out.push(
    "",
    row("Item", "Description", "Qty", "Unit Price", "Amount"),
    "-".repeat(88),
  );
  for (const line of p.lines) {
    out.push(
      row(
        line.sku,
        line.description,
        line.quantity,
        line.unitPrice,
        line.amount,
      ),
    );
  }
  out.push("-".repeat(88));
  for (const t of totalRows(p, l)) {
    out.push(`${(t.label + ":").padStart(70)} ${t.amount.padStart(17)}`);
  }

  out.push("");
  if (p.bank !== null) out.push(`${l.bank} ${p.bank}.`);
  if (p.remitTo !== null) out.push(`${l.remitTo} ${p.remitTo}`);
  out.push("Please quote the invoice number with your payment.", "", p.footer);
  return out;
}

/** An invoice sent as an email body. */
function emailLines(p: Printed): string[] {
  const out: string[] = [
    `From: ${p.vendorContact} <${p.vendorEmail}>`,
    `To: Accounts Payable <${p.customerEmail}>`,
    `Subject: Invoice ${p.invoiceNumber} from ${p.vendorName}`,
    "",
    `Hello ${p.attn},`,
    "",
    "Please find our invoice details below.",
    "",
    `Invoice number: ${p.invoiceNumber}`,
    `Invoice date: ${p.invoiceDate}`,
  ];
  if (p.dueDate !== null) out.push(`Due date: ${p.dueDate}`);
  out.push(
    `Terms: ${p.terms}`,
    `Your PO: ${p.poNumber}`,
    `Customer account: ${p.customerId}`,
  );
  if (p.currencyNote !== null) out.push(p.currencyNote);

  out.push("", `Billed to: ${p.customerName}, ${p.customerAddress.join(", ")}`);
  if (p.shipTo !== null)
    out.push(`Ship to: ${p.shipTo.name}, ${p.shipTo.address.join(", ")}`);

  out.push("", "Items:");
  for (const line of p.lines) {
    out.push(
      `- ${line.description} (${line.sku}): ${line.quantity} x ${line.unitPrice} = ${line.amount}`,
    );
  }
  out.push("");
  for (const t of totalRows(p, EN_LABELS)) out.push(`${t.label}: ${t.amount}`);

  out.push("");
  if (p.bank !== null) out.push(`Payment by EFT to ${p.bank}.`);
  if (p.remitTo !== null) out.push(`Cheques: please remit to ${p.remitTo}.`);
  out.push(
    "",
    "Thank you,",
    p.vendorContact,
    p.vendorName,
    ...p.vendorAddress,
    p.vendorPhone,
  );
  if (p.gstNumber !== null) out.push(`GST/HST No. ${p.gstNumber}`);
  if (p.provincialTaxId !== null) {
    out.push(`${p.provincialTaxId.kind} No. ${p.provincialTaxId.value}`);
  }
  out.push("", p.footer);
  return out;
}
