import * as mupdf from "mupdf";

/** A one-page PDF with a drawn line and no text layer, like a scan without OCR. */
export function pdfWithoutText(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  try {
    const page = doc.addPage([0, 0, 612, 792], 0, {}, "72 72 m 540 720 l S");
    doc.insertPage(-1, page);
    return doc.saveToBuffer("").asUint8Array().slice();
  } finally {
    doc.destroy();
  }
}

/** A PDF with one line of Helvetica text per page. ASCII only, no parentheses or backslashes. */
export function pdfWithPages(lines: readonly string[]): Uint8Array {
  const doc = new mupdf.PDFDocument();
  try {
    const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
    for (const line of lines) {
      const resources = doc.addObject({ Font: { F1: font } });
      const contents = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`;
      doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, contents));
    }
    return doc.saveToBuffer("").asUint8Array().slice();
  } finally {
    doc.destroy();
  }
}
