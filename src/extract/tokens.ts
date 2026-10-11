/**
 * An over-estimate of how many tokens `text` costs, for the `too_large`
 * pre-check (SPEC §7, decisions #52 and #54). Ollama has no tokenizer endpoint
 * and silently truncates a prompt over `num_ctx`, reporting only the truncated
 * count, so this estimate is the only place an oversized prompt can be caught.
 *
 * Per character: non-ASCII costs its UTF-8 byte count (byte-level BPE never
 * needs more than one token per byte); an ASCII digit costs 1 (Qwen splits
 * digits one per token). Other ASCII is counted per run between digits and
 * non-ASCII characters, at a third of a token rounded up, since BPE merges
 * can't cross a digit: the space in `4021 7730` costs a whole token.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  let run = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isDigit = code >= 0x30 && code <= 0x39;
    if (code <= 0x7f && !isDigit) {
      run += 1;
      continue;
    }
    tokens += Math.ceil(run / 3);
    run = 0;
    tokens += isDigit ? 1 : Buffer.byteLength(char, "utf8");
  }
  return tokens + Math.ceil(run / 3);
}
