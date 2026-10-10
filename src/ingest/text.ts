/** Strips a leading BOM and normalises line endings (`\r\n`, `\r`) to `\n`. */
export function normaliseText(content: string): string {
  const text = content.startsWith("\uFEFF") ? content.slice(1) : content;
  return text.replace(/\r\n?/g, "\n");
}
