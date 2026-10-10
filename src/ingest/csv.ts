import { parse } from "csv-parse/sync";

/**
 * Renders CSV rows as `header: value` lines (via `csv-parse`), so the model sees
 * each value next to its label. Rows are separated by a blank line; a blank value
 * renders as `Header:`; a cell beyond the header is labelled `Column N`; rows
 * with only blank cells are dropped (decision #46). Throws if the CSV can't be parsed.
 */
export function csvToText(content: string): string {
  const [header, ...rows] = parse(content, { relax_column_count: true }).filter(
    (row) => row.some((cell) => cell.trim() !== ""),
  );
  if (header === undefined) return "";
  return rows
    .map((row) => {
      const width = Math.max(header.length, row.length);
      const lines: string[] = [];
      for (let i = 0; i < width; i++) {
        const label = header[i] ?? `Column ${String(i + 1)}`;
        const value = row[i] ?? "";
        lines.push(value.trim() === "" ? `${label}:` : `${label}: ${value}`);
      }
      return lines.join("\n") + "\n";
    })
    .join("\n");
}
