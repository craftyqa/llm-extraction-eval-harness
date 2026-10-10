/** The output fields, in SPEC §3 order. */
export const FIELD_NAMES = [
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "vendorName",
  "vendorTaxId",
  "customerName",
  "currency",
  "subtotal",
  "taxAmount",
  "total",
  "amountDue",
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];

/** How each field's raw text is normalised (SPEC §4). */
export const FIELD_KINDS = {
  invoiceNumber: "invoiceNumber",
  invoiceDate: "date",
  dueDate: "date",
  vendorName: "name",
  vendorTaxId: "taxId",
  customerName: "name",
  currency: "currency",
  subtotal: "amount",
  taxAmount: "amount",
  total: "amount",
  amountDue: "amount",
} as const satisfies Record<FieldName, string>;

export type FieldKind = (typeof FIELD_KINDS)[FieldName];

/** Normalised value types. Amounts are 2-dp decimal strings, dates `YYYY-MM-DD`. */
export type InvoiceFields = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  vendorName: string;
  vendorTaxId: string;
  customerName: string;
  currency: "CAD" | "USD";
  subtotal: string;
  taxAmount: string;
  total: string;
  amountDue: string;
};
