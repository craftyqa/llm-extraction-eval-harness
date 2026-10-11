import type { TaxKind } from "./invoice.ts";
import type { Printed } from "./print.ts";

/** Labels a layout prints next to the values in `Printed`. */
export type Labels = {
  title: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  poNumber: string;
  customerId: string;
  gstNumber: string;
  provincialTaxId: (kind: "QST" | "PST" | "RST") => string;
  billTo: string;
  shipTo: string;
  attn: string;
  qty: string;
  unitPrice: string;
  amount: string;
  subtotal: string;
  shipping: string;
  tax: (kind: TaxKind, rate: string) => string;
  total: string;
  totalDue: string;
  deposit: string;
  balanceDue: string;
  amountDue: string;
  bank: string;
  remitTo: string;
};

export const EN_LABELS: Labels = {
  title: "INVOICE",
  invoiceNumber: "Invoice #",
  invoiceDate: "Invoice Date",
  dueDate: "Due Date",
  terms: "Terms",
  poNumber: "P.O. #",
  customerId: "Customer ID",
  gstNumber: "GST/HST Reg.",
  provincialTaxId: (kind) => `${kind} Reg.`,
  billTo: "BILL TO",
  shipTo: "SHIP TO",
  attn: "Attn:",
  qty: "Qty",
  unitPrice: "Unit Price",
  amount: "Amount",
  subtotal: "Subtotal",
  shipping: "Shipping & Handling",
  tax: (kind, rate) => `${kind} (${rate}%)`,
  total: "Total",
  totalDue: "Total Due",
  deposit: "Less deposit",
  balanceDue: "Balance Due",
  amountDue: "Amount Due",
  bank: "Payment by EFT to",
  remitTo: "Remit to:",
};

export const ERP_LABELS: Labels = {
  title: "I N V O I C E",
  invoiceNumber: "INVOICE NO.",
  invoiceDate: "INVOICE DATE",
  dueDate: "DUE DATE",
  terms: "TERMS",
  poNumber: "CUST. PO",
  customerId: "CUST. NO.",
  gstNumber: "GST #",
  provincialTaxId: (kind) => `${kind} #`,
  billTo: "SOLD TO",
  shipTo: "SHIP TO",
  attn: "ATTN:",
  qty: "QTY",
  unitPrice: "UNIT PRICE",
  amount: "EXTENSION",
  subtotal: "MERCHANDISE",
  shipping: "FREIGHT",
  tax: (kind, rate) => `${kind} ${rate}%`,
  total: "INVOICE TOTAL",
  totalDue: "TOTAL DUE",
  deposit: "LESS DEPOSIT",
  balanceDue: "BALANCE DUE",
  amountDue: "AMOUNT DUE",
  bank: "EFT:",
  remitTo: "REMIT TO",
};

const FRENCH_TAX: Record<TaxKind, string> = {
  GST: "TPS",
  HST: "TVH",
  PST: "TVP",
  QST: "TVQ",
  RST: "TVD",
};

export const BILINGUAL_LABELS: Labels = {
  title: "FACTURE / INVOICE",
  invoiceNumber: "Facture n° / Invoice No.",
  invoiceDate: "Date",
  dueDate: "Échéance / Due date",
  terms: "Conditions / Terms",
  poNumber: "Bon de commande / PO No.",
  customerId: "N° client / Client No.",
  gstNumber: "TPS/TVH / GST/HST n°",
  provincialTaxId: (kind) => `${FRENCH_TAX[kind]} / ${kind} n°`,
  billTo: "FACTURER À / BILL TO",
  shipTo: "LIVRER À / SHIP TO",
  attn: "Attn:",
  qty: "Qté / Qty",
  unitPrice: "Prix / Unit price",
  amount: "Montant / Amount",
  subtotal: "Sous-total / Subtotal",
  shipping: "Livraison / Shipping",
  tax: (kind, rate) => `${FRENCH_TAX[kind]} / ${kind} (${rate} %)`,
  total: "Total",
  totalDue: "Total dû / Total due",
  deposit: "Moins acompte / Less deposit",
  balanceDue: "Solde dû / Balance due",
  amountDue: "Montant dû / Amount due",
  bank: "Paiement par virement / Payment by transfer:",
  remitTo: "Remettre à / Remit to:",
};

export type TotalRow = { label: string; amount: string; strong: boolean };

/** The totals block, top to bottom. */
export function totalRows(printed: Printed, labels: Labels): TotalRow[] {
  const rows: TotalRow[] = [];
  const row = (label: string, amount: string | null, strong = false) => {
    if (amount !== null) rows.push({ label, amount, strong });
  };
  row(labels.subtotal, printed.subtotal);
  row(labels.shipping, printed.shipping);
  for (const t of printed.taxes) row(labels.tax(t.kind, t.rate), t.amount);
  if (printed.combinedTotal) {
    row(labels.totalDue, printed.total, true);
  } else {
    row(labels.total, printed.total, true);
    row(labels.deposit, printed.deposit);
    row(
      printed.deposit === null ? labels.amountDue : labels.balanceDue,
      printed.amountDue,
      true,
    );
  }
  return rows;
}
