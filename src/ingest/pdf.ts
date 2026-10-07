export type PdfText = { text: string; pageCount: number };

/**
 * Text layer of a PDF via `mupdf`. Must reproduce `source.mupdf.txt` for every
 * case in `spec/examples/`, since grounding is checked against that text (SPEC §5).
 */
export function extractPdfText(_data: Uint8Array): PdfText {
  throw new Error("Not implemented: extractPdfText");
}

/**
 * Counts characters the parser couldn't map: Unicode Private Use Area
 * (U+E000–U+F8FF and planes 15–16) and U+FFFD. Decision #19.
 */
export function countUnmappedGlyphs(_text: string): number {
  throw new Error("Not implemented: countUnmappedGlyphs");
}
