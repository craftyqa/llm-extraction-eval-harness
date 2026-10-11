import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import {
  BILINGUAL_LABELS,
  EN_LABELS,
  ERP_LABELS,
  type Labels,
  totalRows,
} from "./labels.ts";
import type { Printed } from "./print.ts";

const PAGE: [number, number] = [612, 792];
const LEFT = 50;
const RIGHT = 562;
const TOP = 742;
const BOTTOM = 80;

type TextOptions = {
  size?: number;
  bold?: boolean;
  align?: "left" | "right";
  grey?: boolean;
};

/** A cursor over pages of Helvetica text. Every string is one `drawText` call, so MuPDF extracts it intact. */
class Canvas {
  readonly pages: PDFPage[] = [];
  y = TOP;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.addPage();
  }

  addPage(): void {
    this.pages.push(this.doc.addPage(PAGE));
    this.y = TOP;
  }

  /** Starts a new page unless `height` fits above the bottom margin. */
  need(height: number): void {
    if (this.y - height < BOTTOM) this.addPage();
  }

  text(
    s: string,
    x: number,
    { size = 9, bold = false, align = "left", grey = false }: TextOptions = {},
    y = this.y,
  ): void {
    if (s === "") return;
    const font = bold ? this.bold : this.regular;
    const left = align === "right" ? x - font.widthOfTextAtSize(s, size) : x;
    const page = this.pages.at(-1);
    page?.drawText(s, {
      x: left,
      y,
      size,
      font,
      color: grey ? rgb(0.35, 0.35, 0.35) : rgb(0, 0, 0),
    });
  }

  rule(): void {
    this.pages.at(-1)?.drawLine({
      start: { x: LEFT, y: this.y + 9 },
      end: { x: RIGHT, y: this.y + 9 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  /** Draws lines top to bottom from `y`; returns the y below the last one. */
  column(
    lines: { s: string; opts?: TextOptions }[],
    x: number,
    y: number,
    step = 12,
  ): number {
    for (const { s, opts } of lines) {
      this.text(s, x, opts, y);
      y -= step;
    }
    return y;
  }

  /** Footer and page numbers on every page, drawn last. */
  finish(footer: string): void {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      const options = {
        size: 7,
        font: this.regular,
        color: rgb(0.35, 0.35, 0.35),
      };
      page.drawText(footer, { x: LEFT, y: 40, ...options });
      const label = `Page ${String(i + 1)} of ${String(total)}`;
      page.drawText(label, {
        x: RIGHT - this.regular.widthOfTextAtSize(label, 7),
        y: 40,
        ...options,
      });
    });
  }
}

/**
 * A PDF with a text layer in the standard Helvetica fonts (WinAnsi, so no
 * U+202F). Byte-identical for the same input: pdf-lib's metadata update is off,
 * and the creation and modification dates are the invoice date.
 */
export async function renderPdf(
  printed: Printed,
  layout: "classic" | "erp" | "bilingual",
  invoiceDate: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const date = new Date(`${invoiceDate}T12:00:00Z`);
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  doc.setProducer("llm-extraction-eval-harness data/generator");
  const canvas = new Canvas(
    doc,
    await doc.embedFont(StandardFonts.Helvetica),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );
  if (layout === "erp") drawErp(canvas, printed);
  else
    drawClassic(
      canvas,
      printed,
      layout === "bilingual" ? BILINGUAL_LABELS : EN_LABELS,
    );
  canvas.finish(printed.footer);
  return doc.save({ useObjectStreams: false });
}

/** Header left, invoice details right, line table, totals, payment details. */
function drawClassic(c: Canvas, p: Printed, l: Labels): void {
  c.text(p.vendorName, LEFT, { size: 15, bold: true });
  c.text(l.title, RIGHT, { size: 18, bold: true, align: "right" });

  const left = c.column(
    [...p.vendorAddress, `${p.vendorPhone} · ${p.vendorEmail}`].map((s) => ({
      s,
    })),
    LEFT,
    TOP - 20,
  );
  const details: [string, string | null][] = [
    [l.invoiceNumber, p.invoiceNumber],
    [l.invoiceDate, p.invoiceDate],
    [l.dueDate, p.dueDate],
    [l.terms, p.terms],
    [l.poNumber, p.poNumber],
    [l.customerId, p.customerId],
    [l.gstNumber, p.gstNumber],
    [
      p.provincialTaxId === null
        ? ""
        : l.provincialTaxId(p.provincialTaxId.kind),
      p.provincialTaxId?.value ?? null,
    ],
  ];
  let y = TOP - 34;
  for (const [label, value] of details) {
    if (value === null) continue;
    c.text(label, 330, { bold: true }, y);
    c.text(value, 470, {}, y);
    y -= 13;
  }
  c.y = Math.min(left, y) - 14;

  // Parties
  const billTo = [
    { s: l.billTo, opts: { bold: true } },
    { s: p.customerName },
    { s: `${l.attn} ${p.attn}` },
    ...p.customerAddress.map((s) => ({ s })),
  ];
  let bottom = c.column(billTo, LEFT, c.y);
  if (p.shipTo !== null) {
    const shipTo = [
      { s: l.shipTo, opts: { bold: true } },
      { s: p.shipTo.name },
      ...p.shipTo.address.map((s) => ({ s })),
    ];
    bottom = Math.min(bottom, c.column(shipTo, 310, c.y));
  }
  c.y = bottom - 8;
  if (p.currencyNote !== null) {
    c.text(p.currencyNote, LEFT, { bold: true });
    c.y -= 16;
  }

  // Line items
  const header = () => {
    c.text("#", LEFT, { bold: true });
    c.text("Description", 70, { bold: true });
    c.text(l.qty, 385, { bold: true, align: "right" });
    c.text(l.unitPrice, 475, { bold: true, align: "right" });
    c.text(l.amount, RIGHT, { bold: true, align: "right" });
    c.y -= 6;
    c.rule();
    c.y -= 10;
  };
  header();
  p.lines.forEach((line, i) => {
    if (c.y - 24 < BOTTOM) {
      c.addPage();
      header();
    }
    c.text(String(i + 1), LEFT);
    c.text(line.description, 70);
    c.text(line.quantity, 385, { align: "right" });
    c.text(line.unitPrice, 475, { align: "right" });
    c.text(line.amount, RIGHT, { align: "right" });
    c.text(`Item ${line.sku}`, 70, { size: 7, grey: true }, c.y - 10);
    c.y -= 24;
  });

  drawTotals(c, p, l, 360);
  drawPayment(c, p, l);
}

/** Dense ERP printout: caps labels, label-over-value grid, remit-to block. */
function drawErp(c: Canvas, p: Printed): void {
  const l = ERP_LABELS;
  c.text(p.vendorName, LEFT, { size: 13, bold: true });
  c.text(l.title, RIGHT, { size: 15, bold: true, align: "right" });
  const left = c.column(
    [...p.vendorAddress, `Tel ${p.vendorPhone} · ${p.vendorEmail}`].map(
      (s) => ({ s }),
    ),
    LEFT,
    TOP - 16,
  );
  const ids = [
    p.gstNumber === null ? "" : `${l.gstNumber} ${p.gstNumber}`,
    p.provincialTaxId === null
      ? ""
      : `${l.provincialTaxId(p.provincialTaxId.kind)} ${p.provincialTaxId.value}`,
  ].filter((s) => s !== "");
  const right = c.column(
    ids.map((s) => ({ s, opts: { align: "right" as const } })),
    RIGHT,
    TOP - 16,
  );
  c.y = Math.min(left, right) - 12;

  const grid: [string, string | null][] = [
    [l.invoiceNumber, p.invoiceNumber],
    [l.invoiceDate, p.invoiceDate],
    [l.customerId, p.customerId],
    [l.poNumber, p.poNumber],
    [l.terms, p.terms],
    [l.dueDate, p.dueDate],
  ];
  const cells = grid.filter((g): g is [string, string] => g[1] !== null);
  cells.forEach(([label, value], i) => {
    const x = LEFT + (i % 4) * 128;
    c.text(label, x, { size: 7, bold: true });
    c.text(value, x, {}, c.y - 11);
    if (i % 4 === 3 || i === cells.length - 1) c.y -= 28;
  });
  if (p.currencyNote !== null) {
    c.text(p.currencyNote, LEFT, { bold: true });
    c.y -= 16;
  }

  const soldTo = [
    { s: l.billTo, opts: { size: 7, bold: true } },
    { s: p.customerName },
    { s: `${l.attn} ${p.attn.toUpperCase()}` },
    ...p.customerAddress.map((s) => ({ s })),
  ];
  let bottom = c.column(soldTo, LEFT, c.y, 11);
  if (p.shipTo !== null) {
    const shipTo = [
      { s: l.shipTo, opts: { size: 7, bold: true } },
      { s: p.shipTo.name },
      ...p.shipTo.address.map((s) => ({ s })),
    ];
    bottom = Math.min(bottom, c.column(shipTo, 310, c.y, 11));
  }
  c.y = bottom - 10;

  const header = () => {
    const h = { size: 7, bold: true };
    c.text("LN", LEFT, h);
    c.text("ITEM NO.", 70, h);
    c.text("DESCRIPTION", 130, h);
    c.text("QTY", 400, { ...h, align: "right" });
    c.text("UNIT PRICE", 480, { ...h, align: "right" });
    c.text("EXTENSION", RIGHT, { ...h, align: "right" });
    c.y -= 4;
    c.rule();
    c.y -= 10;
  };
  header();
  p.lines.forEach((line, i) => {
    if (c.y - 13 < BOTTOM) {
      c.addPage();
      header();
    }
    c.text(String(i + 1), LEFT, { size: 8 });
    c.text(line.sku, 70, { size: 8 });
    c.text(line.description.toUpperCase(), 130, { size: 8 });
    c.text(line.quantity, 400, { size: 8, align: "right" });
    c.text(line.unitPrice, 480, { size: 8, align: "right" });
    c.text(line.amount, RIGHT, { size: 8, align: "right" });
    c.y -= 13;
  });

  // Remit-to block on the left, beside the totals
  c.y -= 6;
  const remit: { s: string; opts?: TextOptions }[] = [
    ...(p.remitTo === null ? [] : [{ s: p.remitTo }]),
    ...(p.bank === null ? [] : [{ s: `${l.bank} ${p.bank}` }]),
  ];
  if (remit.length > 0)
    remit.unshift({ s: l.remitTo, opts: { size: 7, bold: true } });
  c.need(Math.max(remit.length * 11, totalRows(p, l).length * 13) + 10);
  const remitBottom = c.column(remit, LEFT, c.y, 11);
  drawTotals(c, p, l, 380);
  c.y = Math.min(c.y, remitBottom) - 8;
  c.text(
    "Claims for shortage or damage must be made within 5 days of receipt.",
    LEFT,
    { size: 7 },
  );
}

function drawTotals(c: Canvas, p: Printed, l: Labels, labelX: number): void {
  const rows = totalRows(p, l);
  c.need(rows.length * 13 + 10);
  for (const row of rows) {
    c.text(row.label, labelX, { bold: row.strong });
    c.text(row.amount, RIGHT, { bold: row.strong, align: "right" });
    c.y -= 13;
  }
  c.y -= 10;
}

function drawPayment(c: Canvas, p: Printed, l: Labels): void {
  const lines = [
    ...(p.bank === null ? [] : [`${l.bank} ${p.bank}`]),
    ...(p.remitTo === null ? [] : [`${l.remitTo} ${p.remitTo}`]),
  ];
  c.need(lines.length * 12 + 12);
  for (const s of lines) {
    c.text(s, LEFT);
    c.y -= 12;
  }
}
