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
