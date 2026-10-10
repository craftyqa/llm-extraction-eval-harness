import * as mupdf from "mupdf";

export type PdfText = { text: string; pageCount: number };

/** Above this share of non-whitespace characters, unmapped glyphs make a PDF `unreadable` (decision #45). */
export const MAX_UNMAPPED_GLYPH_SHARE = 0.005;

/**
 * Text layer of a PDF via `mupdf`. Must reproduce `source.mupdf.txt` for every
 * case in `spec/examples/`, since grounding is checked against that text (SPEC §5).
 * Each page's `preserve-whitespace` text, concatenated (decision #45).
 * Throws if MuPDF can't open the file.
 */
export function extractPdfText(data: Uint8Array): PdfText {
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  try {
    const pageCount = doc.countPages();
    let text = "";
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const structured = page.toStructuredText("preserve-whitespace");
      text += structured.asText();
      structured.destroy();
      page.destroy();
    }
    return { text, pageCount };
  } finally {
    doc.destroy();
  }
}

const unmappedGlyph =
  /[\uE000-\uF8FF\uFFFD\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;

/**
 * Counts characters the parser couldn't map: Unicode Private Use Area
 * (U+E000–U+F8FF and planes 15–16) and U+FFFD. Decision #19.
 */
export function countUnmappedGlyphs(text: string): number {
  return text.match(unmappedGlyph)?.length ?? 0;
}

/** True when `unmapped` is more than `MAX_UNMAPPED_GLYPH_SHARE` of the non-whitespace characters in `text`. */
export function hasTooManyUnmappedGlyphs(
  text: string,
  unmapped: number,
): boolean {
  const visible = text.match(/\S/gu)?.length ?? 0;
  return visible > 0 && unmapped / visible > MAX_UNMAPPED_GLYPH_SHARE;
}
