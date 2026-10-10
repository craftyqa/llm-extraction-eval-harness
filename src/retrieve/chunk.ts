/** A slice of the ingested text. `text === source.slice(start, end)`, offsets in UTF-16 code units. */
export type Chunk = { id: number; start: number; end: number; text: string };

export type ChunkOptions = { size: number; overlap: number };

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { size: 800, overlap: 100 };

/**
 * Splits text into chunks of at most `size` characters. Each chunk ends at the
 * last paragraph break, line break or whitespace in its second half, in that order
 * of preference, else at `size`. The next chunk starts up to `overlap` characters
 * earlier, at a line start where there is one, else a word start (decision #48).
 */
export function chunk(
  text: string,
  { size, overlap }: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Chunk[] {
  if (!(size > 0 && overlap >= 0 && overlap < size / 2)) {
    throw new RangeError(
      `Need size > 0 and 0 <= overlap < size / 2 (got size ${String(size)}, overlap ${String(overlap)})`,
    );
  }

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    const end =
      text.length - start <= size
        ? text.length
        : cutPoint(text, start + Math.floor(size / 2), start + size);
    chunks.push({
      id: chunks.length,
      start,
      end,
      text: text.slice(start, end),
    });
    if (end === text.length) break;
    start = Math.max(overlapStart(text, end - overlap, end), start + 1);
  }
  return chunks;
}

/** The best end for a chunk in `(min, limit]`. */
function cutPoint(text: string, min: number, limit: number): number {
  for (const separator of ["\n\n", "\n"]) {
    const i = text.lastIndexOf(separator, limit - separator.length);
    if (i >= 0 && i + separator.length > min) return i + separator.length;
  }
  for (let i = limit - 1; i >= min; i--) {
    if (isWhitespace(text, i)) return i + 1;
  }
  // Hard cut; don't split a surrogate pair
  return isHighSurrogate(text, limit - 1) && limit - 1 > min
    ? limit - 1
    : limit;
}

/** The first line start in `[from, end)`, else the first word start, else `from`. */
function overlapStart(text: string, from: number, end: number): number {
  const lineStart = text.indexOf("\n", from - 1) + 1;
  if (lineStart > 0 && lineStart < end) return lineStart;
  for (let i = from; i < end; i++) {
    if (isWhitespace(text, i - 1) && !isWhitespace(text, i)) return i;
  }
  return isHighSurrogate(text, from - 1) ? from - 1 : from;
}

function isWhitespace(text: string, i: number): boolean {
  return /\s/u.test(text.charAt(i));
}

function isHighSurrogate(text: string, i: number): boolean {
  const code = text.charCodeAt(i);
  return code >= 0xd800 && code <= 0xdbff;
}
