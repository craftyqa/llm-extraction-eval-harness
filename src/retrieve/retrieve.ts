import type { FieldName } from "../extract/fields.ts";
import type { Chunk } from "./chunk.ts";

/**
 * Query terms per output field (SPEC §3 labels, plus French labels for bilingual
 * invoices). Matched as a bag of tokens, so `"amount due"` adds `amount` and `due`.
 */
export const FIELD_QUERIES = {
  invoiceNumber: [
    "invoice number",
    "invoice no",
    "bill no",
    "facture",
    "numéro",
  ],
  invoiceDate: ["invoice date", "date", "issued", "date de facture"],
  dueDate: ["due date", "payment due", "terms", "échéance"],
  vendorName: ["vendor", "supplier", "from", "fournisseur"],
  vendorTaxId: [
    "gst",
    "hst",
    "tps",
    "tvh",
    "registration",
    "business number",
    "bn",
  ],
  customerName: ["bill to", "billed to", "sold to", "customer", "client"],
  currency: ["currency", "cad", "usd", "cdn", "funds", "devise"],
  subtotal: ["subtotal", "sub total", "merchandise", "fees", "sous total"],
  taxAmount: ["tax", "taxes", "gst", "hst", "pst", "qst", "tps", "tvh", "tvq"],
  total: ["total", "invoice total", "current charges", "montant"],
  amountDue: [
    "amount due",
    "balance due",
    "total due",
    "pay",
    "montant dû",
    "solde",
  ],
} as const satisfies Record<FieldName, readonly string[]>;

export type Passage = { start: number; end: number; text: string };

export type Retrieval = {
  /** Retrieved chunk IDs, in document order. */
  chunkIds: number[];
  /** Per field: matching chunk IDs, best first, at most `k`. */
  byField: Record<FieldName, number[]>;
  /** Retrieved chunks with overlapping or touching ones merged, in document order. */
  passages: Passage[];
};

export type RetrieveOptions = { k: number };

export const DEFAULT_RETRIEVE_OPTIONS: RetrieveOptions = { k: 3 };

const K1 = 1.2;
const B = 0.75;

/** Lowercase letter/digit runs with accents removed: `"Montant dû:"` → `["montant", "du"]`. */
export function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/**
 * BM25 over the chunks for each field's query terms; the top `k` chunks with a
 * score above 0 per field, ties to the earlier chunk. The first chunk is always
 * retrieved, since the header carries the title and parties that the reject
 * decisions need (decision #48).
 */
export function retrieve(
  source: string,
  chunks: readonly Chunk[],
  { k }: RetrieveOptions = DEFAULT_RETRIEVE_OPTIONS,
): Retrieval {
  const index = new Bm25(chunks.map((c) => tokenize(c.text)));

  const byField = {} as Record<FieldName, number[]>;
  for (const [field, phrases] of Object.entries(FIELD_QUERIES)) {
    const terms = [...new Set(phrases.flatMap(tokenize))];
    byField[field as FieldName] = chunks
      .map((c, i) => ({ id: c.id, score: index.score(terms, i) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, k)
      .map((r) => r.id);
  }

  const ids = new Set(Object.values(byField).flat());
  const first = chunks[0];
  if (first !== undefined) ids.add(first.id);
  const retrieved = chunks.filter((c) => ids.has(c.id));

  return {
    chunkIds: retrieved.map((c) => c.id),
    byField,
    passages: mergePassages(source, retrieved),
  };
}

function mergePassages(source: string, chunks: readonly Chunk[]): Passage[] {
  const spans: { start: number; end: number }[] = [];
  for (const c of [...chunks].sort((a, b) => a.start - b.start)) {
    const last = spans.at(-1);
    if (last !== undefined && c.start <= last.end) {
      last.end = Math.max(last.end, c.end);
    } else {
      spans.push({ start: c.start, end: c.end });
    }
  }
  return spans.map((s) => ({ ...s, text: source.slice(s.start, s.end) }));
}

class Bm25 {
  private readonly termFrequencies: Map<string, number>[];
  private readonly lengths: number[];
  private readonly documentFrequency = new Map<string, number>();
  private readonly averageLength: number;

  constructor(documents: readonly string[][]) {
    this.termFrequencies = documents.map((tokens) => {
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) {
        this.documentFrequency.set(t, (this.documentFrequency.get(t) ?? 0) + 1);
      }
      return tf;
    });
    this.lengths = documents.map((tokens) => tokens.length);
    const total = this.lengths.reduce((sum, n) => sum + n, 0);
    this.averageLength = documents.length > 0 ? total / documents.length : 0;
  }

  score(terms: readonly string[], doc: number): number {
    const tf = this.termFrequencies[doc];
    const length = this.lengths[doc];
    if (tf === undefined || length === undefined || this.averageLength === 0) {
      return 0;
    }
    const n = this.termFrequencies.length;
    let score = 0;
    for (const term of terms) {
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const df = this.documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score +=
        (idf * f * (K1 + 1)) /
        (f + K1 * (1 - B + (B * length) / this.averageLength));
    }
    return score;
  }
}
