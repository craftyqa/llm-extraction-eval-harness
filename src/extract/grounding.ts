import type { Evidence } from "./types.ts";

/** Text with every whitespace run collapsed to one space, mapped back to the original's offsets. */
export type CollapsedText = {
  text: string;
  /** For each collapsed code unit, its start offset in the original. */
  starts: number[];
  /** For each collapsed code unit, its end offset (exclusive) in the original. */
  ends: number[];
};

/** Collapses whitespace runs (line breaks, U+00A0, U+202F, …) to a single space (SPEC §5). */
export function collapseWhitespace(original: string): CollapsedText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  const runs = /\s+|\S/gu;
  for (const match of original.matchAll(runs)) {
    const start = match.index;
    const end = start + match[0].length;
    const isRun = /^\s/u.test(match[0]);
    const piece = isRun ? " " : match[0];
    for (let i = 0; i < piece.length; i++) {
      text += piece.charAt(i);
      starts.push(isRun ? start : start + i);
      ends.push(isRun ? end : start + i + 1);
    }
  }
  return { text, starts, ends };
}

const isBlank = (s: string) => s.trim() === "";

/**
 * Grounds one evidence item against the ingested source (SPEC §5): offsets of
 * the first match of `quote`, and grounded when `quote` is in the source and
 * `raw` is in `quote`, both compared after collapsing whitespace.
 */
export function groundEvidence(
  raw: string,
  quote: string,
  source: CollapsedText,
): Evidence {
  if (isBlank(raw) || isBlank(quote)) {
    return { raw, quote, start: null, end: null, grounded: false };
  }
  const needle = collapseWhitespace(quote).text;
  const at = source.text.indexOf(needle);
  if (at === -1) {
    return { raw, quote, start: null, end: null, grounded: false };
  }
  return {
    raw,
    quote,
    start: source.starts[at] ?? null,
    end: source.ends[at + needle.length - 1] ?? null,
    grounded: needle.includes(collapseWhitespace(raw).text),
  };
}
