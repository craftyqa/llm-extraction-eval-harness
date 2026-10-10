# Grading Spec — Canadian Supplier Invoice Extraction

Version 0.1.0 · 2026-10-06 · @Jen · Status: draft (blind-grade test complete)

This file is self-contained. A grader needs only this spec, the source documents and the outputs to grade a run. Golden examples and worked grading examples live in `spec/examples/`; risks and their severities are in `spec/risks.md`.

## 1. Problem statement

An accounts-payable clerk at a Canadian company uploads a supplier invoice. The system pre-fills the AP entry form. The clerk reviews the form and approves it for payment.

A blank field costs the clerk a minute; a plausible wrong value can get approved and paid. **Wrong is worse than missing, so the system should abstain rather than guess.** Every rule below follows from this.

## 2. Scope

### What counts as an invoice

An invoice is a seller's request for payment that identifies the seller, has an invoice number or date, and states an amount owed. **The title doesn't matter**: a document titled "Bill", "Statement & Invoice" or "Facture / Invoice" is an invoice if it meets this definition. Where the scope table below names a document type, the table takes precedence over this definition.

| In scope | Out of scope → reject `out_of_scope` |
| --- | --- |
| Invoices, including invoices marked "PAID" and invoices with a remittance slip attached | Receipts, quotes/estimates, pro formas, credit notes, purchase orders, contracts |
| Combined statement/invoices that have **their own invoice number and current charges** (e.g. utility bills) | Statements of account that only list other invoices |
| Vendor and customer both Canadian | Either party clearly located outside Canada (address, tax registration). A missing address alone is not a reason to reject |

### Language

The language check asks: **are the document's labels in English, alone or alongside another language?**

- English, or bilingual with English labels (e.g. `Facture / Invoice`, `Factuurnummer / Invoice no.`) → passes.
- No English labels (French-only, or any other language) → reject `unsupported_language`.

The check is about labels, not party names or free text.

### Other scope rules

| Area | Supported | Otherwise |
| --- | --- | --- |
| Currency | CAD, USD | field `currency` → `not_found` (if the document is otherwise in scope) |
| Taxes | GST, HST, PST, QST; one or more tax lines | — |
| Dates | `YYYY-MM-DD`; `NN/NN/YYYY` with `/`, `-` or `.` separators; written months in EN or FR, full or abbreviated (`March 4, 2026`, `4 mars 2026`, `08-Sep-2026`, `1er mars 2026`, `March 1st, 2026`) | see §4 |
| Amounts | `1,234.50`, `$1,234.50`, `1 234,50 $`, `1.234,50` (incl. U+00A0 / U+202F spaces) | see §4 |
| Source text | PDF with a text layer, CSV, plain text | PDF with no text layer → reject `unreadable` |

**One document per file.** `multiple_documents` means the file contains more than one invoice, each with its own invoice number and its own total. Only invoices contained in the file count: invoices that are only listed or referenced (e.g. on a statement of account, or as "previous invoice" on a new one) don't. A remittance slip that repeats the same invoice number is part of the same invoice.

## 3. Output fields

"Required" means a valid invoice is expected to show this field; stricter thresholds apply. **Every field key is always present in the output.** A required field missing from the document is `not_found`, never a reject. Values are **never computed** from other values, with one exception: `taxAmount` sums its tax lines.

| Field | Normalised form | Required | Matcher | Definition |
| --- | --- | --- | --- | --- |
| `invoiceNumber` | string | yes | exact | The invoice's own identifier (labels: Invoice #, Invoice No., Bill No., Facture, N°). Strip label prefixes and surrounding whitespace; keep internal punctuation, leading zeros and prefixes that are part of the number (`INV-2026-04817`). Never a PO, order, customer, account, delivery or tax-registration number. |
| `invoiceDate` | `YYYY-MM-DD` | yes | exact | Issue date (labels: Invoice Date, Date, Issued). For combined statement/invoices, the statement date. Not the order, ship, service or billing-period date. |
| `dueDate` | `YYYY-MM-DD` | no | exact | An explicit printed date only. Terms such as "Net 30", "Due on receipt" or "2% 10" with no printed date → `not_found`. |
| `vendorName` | string | yes | token-set | The entity issuing the invoice, as named in the header. Never the remit-to party, lockbox, bank, payment processor or factoring company. For a sole proprietor, the expected value is the name as printed; `alternatives` lists the trading name and the person's name. |
| `vendorTaxId` | `123456789RT0001` | no | exact | The vendor's GST/HST registration: 9-digit business number + `RT` + 4 digits, spaces and dashes removed. QST, PST, VAT and company-registry numbers are not this field. |
| `customerName` | string | yes | token-set | The bill-to entity (labels: Bill To, Billed To, Sold To, Customer). Not the ship-to entity, service address or contact person. |
| `currency` | `CAD` \| `USD` | yes | exact | `$`, `C$`, `CAD`, `CDN` → CAD. `US$`, `USD`, "US funds" → USD. A bare `$` is CAD. |
| `subtotal` | decimal string, 2 dp | no | amount | The printed pre-tax figure that equals the sum of the line amounts as printed (after any per-line discounts), **before** document-level discounts, shipping/freight, fees, deposits and tax (labels: Subtotal, Merchandise, Fees). If no such figure is printed → `not_found`. |
| `taxAmount` | decimal string, 2 dp | no | amount | **Sum of all sales-tax lines** (GST+PST, GST+QST or HST), one evidence item per line. An explicit zero or "exempt" line → `"0.00"`. No tax line at all → `not_found`. |
| `total` | decimal string, 2 dp | yes | amount | Gross total of **this** invoice including tax (labels: Total, Invoice Total, Total Current Charges). **Not** a figure after deposits, payments, retainers or credits, and not one that includes prior balances. If the gross total isn't printed → `not_found`. |
| `amountDue` | decimal string, 2 dp | no | amount | The amount the customer is asked to pay now (labels: Amount Due, Balance Due, Total Amount Due), after deposits, payments, retainers, credits and prior balances. When nothing is deducted or added it is the same printed figure as `total`; a single combined line such as "Total Due" then feeds both fields. |
| `lineItems` | — | — | — | **Stretch**; not in v1 output or scoring. |

## 4. Normalisation (app code, not the model)

The model returns raw text exactly as printed, plus quotes. The app normalises it. A normalisation failure gives `not_found` with reason `unparseable`.

**Amounts**
1. Remove currency symbols and codes, and all space characters (including U+00A0 and U+202F).
2. A leading `-` or `−` (U+2212), or surrounding parentheses, means negative. Negatives are allowed by the normaliser; a negative `total` indicates a credit note.
3. If there is no `.` or `,`, the amount is a whole number. Otherwise look at the **last** `.` or `,`:
   - followed by exactly 2 digits → decimal separator; every other `.`/`,` is a thousands separator;
   - followed by exactly 3 digits → thousands separator; no decimal part;
   - anything else → `unparseable`.
4. After steps 1–3, anything left other than digits and one decimal point → `unparseable`.
5. Output a 2-dp string. Compare as integer cents.

Examples: `$1,290.65` → `1290.65` · `1 234,50 $` → `1234.50` · `€ 4.250,90` → `4250.90` · `−$612.44` → `-612.44` · `1,234` → `1234.00` · `$1.5` → unparseable · `$500` → `500.00` · `1 234 $` → `1234.00` · `500 CR` → unparseable.

**Dates**
1. `YYYY-MM-DD` and written months are unambiguous. A day may carry an ordinal suffix: English `st`, `nd`, `rd`, `th`, or French `er` for the first of the month (`1er mars 2026` → `2026-03-01`). Month names may be abbreviated, with or without a period (`Sep`, `Sept.`, `févr.`), and French month names may omit their accents (`fevrier`, `aout`, `decembre`).
2. `NN/NN/YYYY` (separator `/`, `-` or `.`):
   - If one component is > 12, that component is the day.
   - If both components are equal, the date is unambiguous.
   - Otherwise, look for another date in the **same document, in the same numeric format**, with a component > 12, and use its order.
   - If there isn't one → `not_found` / `ambiguous`. Nothing else decides the order: not a written-month date, payment terms combined with a due date, or the vendor's location or language.
3. Two-digit years → `not_found` / `ambiguous`.
4. A result outside a real calendar date → `unparseable`.

**Strings**: `invoiceNumber` strips label prefixes and surrounding whitespace. `vendorTaxId` removes spaces and dashes. Names are stored as printed; normalisation for comparison happens in the matcher (§8).

**Multiple evidence items**
- `taxAmount`: value = sum of the normalised raws (one per tax line).
- Every other field: all raws must normalise to the same value (e.g. a due date printed twice in different formats). If they don't, the app returns `not_found` / `conflicting`.

## 5. Output contract

```ts
type Evidence = {
  raw: string;          // model: the value exactly as printed; non-empty after trimming
  quote: string;        // model: verbatim source text that contains raw; non-empty after trimming
  start: number | null; // app: see Offsets below
  end: number | null;
  grounded: boolean;    // app: see below
};

type NotFoundReason = "absent" | "ambiguous" | "conflicting" | "unparseable";

type FieldResult<T> =
  | { status: "found"; value: T; evidence: Evidence[] }   // ≥ 1 evidence item
  | { status: "not_found"; reason?: NotFoundReason };

type ExtractionResult =
  | { status: "extracted"; fields: { [K in keyof InvoiceFields]: FieldResult<InvoiceFields[K]> }; meta: RunMeta }
  | { status: "rejected"; reason: RejectReason; meta: RunMeta };

type RejectReason =
  | "empty" | "too_large" | "unreadable" | "unsupported_language"
  | "out_of_scope" | "multiple_documents";
```

The model fills `status`, `evidence[].raw`, `evidence[].quote`, `reason` and the reject reason. The app fills `value`, the offsets and `grounded`.

**Grounding.** An evidence item is grounded when, after collapsing every whitespace run (including line breaks, U+00A0 and U+202F) to a single space on both sides, case-sensitively:
1. `raw` and `quote` are both non-empty after trimming, **and**
2. `quote` occurs in the source text, **and**
3. `raw` occurs in `quote`.

An empty `raw` or `quote` fails the output contract (schema-invalid, so the retry policy applies). The grounding rule still treats one as ungrounded, so outputs checked outside the app's schema are graded the same way.

**Offsets.** `start` and `end` locate the first match of `quote` in the ingested source text, the exact string the ingest step produced, not the whitespace-collapsed copy used for matching. They are UTF-16 code-unit indices with `end` exclusive, so `source.slice(start, end)` returns the matched span as it appears in the source. That span can differ from `quote` in whitespace (a line break where the quote has a space, say). If `quote` doesn't occur, or `raw` or `quote` is empty, both are `null`. If `quote` occurs but `raw` doesn't occur in it, the offsets are still set, and the item is ungrounded.

A field is grounded only if **every** evidence item is grounded. Grounding never changes a field's `status` or `value`: an ungrounded field stays `found`, with `value` normalised from its `raw` (§4) as usual, and `grounded: false`. Grounding is checked against the text produced by the app's own ingest step (PDF text via MuPDF), not against any other PDF-to-text tool. For the cases in `spec/examples/`, that text is `source.mupdf.txt`.

`not_found.reason` is recorded but not graded in v1.

## 6. Expected files

`expected.json` uses the output shape without `meta`, offsets or `grounded`, plus grading-only keys:

```jsonc
{
  "caseId": "EX-03",
  "status": "extracted",              // or "rejected" with "reason"
  "fields": {
    "total": {
      "status": "found",
      "value": "3443.73",                                  // canonical normalised value
      "evidence": [{ "raw": "3,443.73", "quote": "3,443.73" }], // optional; used for judge calibration
      "alternatives": [],                                  // optional; other values that also count as correct
      "decoys": ["2943.73"]                                // optional; known wrong values, for reporting
    },
    "dueDate": { "status": "not_found", "reason": "absent", "decoys": ["2026-09-30"] }
  }
}
```

- For name fields, `value` is a canonical form and may differ from the printed raw in case or accents.
- `alternatives` only exist for genuinely interchangeable values (legal vs trading name). They are never a way to accept a decoy.
- `decoys` don't change the outcome; they let the scorecard count **decoy hits** (see §10).
- `meta.json` records `violatesRules`: rules (§9) that the **source document itself** breaks.

## 7. Refusal rules

| Condition | Result | Model call? |
| --- | --- | --- |
| Empty or whitespace-only text after ingest | reject `empty` | no |
| File larger than 5,000,000 bytes, or > N tokens after ingest (N derived from `num_ctx`) | reject `too_large` | no |
| PDF with no text layer, or a text or CSV file that is binary: not valid UTF-8, or contains a NUL character (U+0000) | reject `unreadable` | no |
| No English labels (§2) | reject `unsupported_language` | yes |
| Not an invoice, or a non-Canadian party (§2) | reject `out_of_scope` | yes |
| More than one invoice (§2) | reject `multiple_documents` | yes |
| A field has two different values and nothing decides between them | field `not_found` / `conflicting` | — |
| A date is ambiguous under §4 | field `not_found` / `ambiguous` | — |

The file type comes from the extension (`.pdf`, `.csv`, `.txt`, case-insensitive). Any other extension, or a missing file, is a usage error (CLI exit code `1`), not a reject: rejects describe the document, not how it was passed in.

**Precedence** when more than one applies: `empty > too_large > unreadable > unsupported_language > out_of_scope > multiple_documents`. A grader decides the expected reason by walking this list in order and stopping at the first condition that holds.

## 8. Matchers

| Matcher | Fields | Rule |
| --- | --- | --- |
| exact | `invoiceNumber`, `invoiceDate`, `dueDate`, `vendorTaxId`, `currency` | Normalised strings are identical (case-sensitive) |
| amount | `subtotal`, `taxAmount`, `total`, `amountDue` | Identical integer cents |
| token-set | `vendorName`, `customerName` | See below |

A value also matches if it matches any of the field's `alternatives`.

### Token-set name matcher

Normalise each name:
1. Unicode NFKD; remove combining marks (accents).
2. Lower-case.
3. Replace `&` with ` and `.
4. Delete `.`, `'` and `’`.
5. Replace every remaining character that isn't a letter or digit with a space.
6. Split on whitespace into tokens.
7. Drop legal-form tokens: `inc incorporated corp corporation ltd limited ltee limitee co company llc llp sec senc sencrl enr`.

Two names **match** when both token lists are non-empty, have the same length, and can be paired one-to-one so that each pair is either:
- identical, or
- both ≥ 5 characters, both letters only, and at Damerau-Levenshtein distance 1 (tolerates one OCR-style error).

Tokens containing digits must be identical. Token order doesn't matter.

| Expected | Actual | Result | Why |
| --- | --- | --- | --- |
| `Keystone Packaging Distributors Ltd.` | `KEYSTONE PACKAGING DISTRIBUTORS LTD.` | match | case, suffix |
| `Driftwood Café & Bakery` | `Driftwood Cafe and Bakery` | match | accents, `&` |
| `Harbourline Industrial Supply Inc.` | `Harbourline Industrial Suppiy` | match | one OCR error in a long token |
| `Fundy Ridge Fabrication Ltd.` | `Fundy Ridge Fabrication — Plant 2` | **no match** | extra tokens `plant`, `2` |
| `Saltmarsh Provisions Inc.` | `Saltmarsh Provisions DC` | **no match** | extra token `dc` |
| `Tidewater Analytics — Morgan Ellery` | `Tidewater Analytics` | no match unless listed in `alternatives` | missing tokens |

## 9. Rules (model-free predicates)

A rule is checked only when every field it uses was found. In Layer 1 checks, a rule violation is ignored for a case whose `meta.json` lists it in `violatesRules`.

- `XF-1` `subtotal + taxAmount == total`, within ±0.01
- `XF-2` `dueDate >= invoiceDate`
- `XF-3` (stretch, warning only) `taxAmount / subtotal` matches a valid combination from `spec/tax-rates.json` (GST, HST, GST+PST, GST+QST), within ±0.5 pp
- `FMT-1` dates fall between 2000-01-01 and 2099-12-31 (fixed, not relative to the run date)
- `FMT-2` `currency` ∈ {CAD, USD}
- `FMT-3` `vendorTaxId` matches `^\d{9}RT\d{4}$`

## 10. Grading

### Field grading: two independent axes

**Axis 1 — value outcome**

| Outcome | Expected | Actual |
| --- | --- | --- |
| `correct` | found(v) | found(v′), matches under the field's matcher |
| `correct_absent` | not_found | not_found |
| `wrong_value` | found(v) | found(v′), no match |
| `missing` | found(v) | not_found |
| `hallucinated` | not_found (any reason) | found |

**Axis 2 — grounding** (found fields only): `grounded` or `ungrounded` (§5).

"**Wrong**" below means `wrong_value` or `hallucinated`. A **decoy hit** is a wrong field whose actual value matches one of the field's `decoys`; it's reported as a sub-count and doesn't change the outcome.

### Document outcomes

| Document outcome | Expected | Actual | Field scoring |
| --- | --- | --- | --- |
| `correct_extract` | extracted | extracted | Fields scored normally |
| `correct_reject` | rejected(r) | rejected(r) | No fields |
| `wrong_reject_reason` | rejected(r) | rejected(r′), r′ ≠ r | No fields; counts as a reject failure |
| `wrong_reject` | extracted | rejected (any reason) | Every expected-found field → `missing`; every expected-not_found field → `correct_absent` |
| `missed_reject` | rejected | extracted | No fields; document-level failure |
| `malformed` | either | schema-invalid after retry | If expected extracted: as `wrong_reject`. If expected rejected: no fields, counts as a reject failure. Always a schema hard fail |

### Case pass

A case passes when **all** of these hold:
1. The document outcome is `correct_extract` or `correct_reject`.
2. No required field is wrong.
3. No found field is both ungrounded and wrong.
4. At most one optional field is wrong.

`missing` fields and correct-but-ungrounded fields don't fail a case on their own; they count against the thresholds in §11.

### Grading procedure (for a human or blind grader)

0. If you don't have an expected output, decide it first from the document alone, using §2–§7: extract or reject (and why), then each field's expected value or `not_found`.
1. Determine the document outcome by comparing expected and actual `status` (and reject `reason`).
2. If fields are scored, for each of the 11 fields: decide the value outcome using §8, then grounding for found fields using §5.
3. Note decoy hits. Decoy hits are counted against the `decoys` in `expected.json`; a grader without an expected file notes wrong values that look like likely decoys.
4. Apply the case-pass rules.
5. Record anything this spec didn't decide as a question; it becomes a spec fix or a new example.

## 11. Metrics and thresholds

Initial values; revise after the first baseline.

- **Hallucination rate** = found fields that are `hallucinated`, **or** ungrounded and not `correct`, ÷ all found fields.
- **Evidence error rate** = `correct` but `ungrounded` ÷ `correct`. Reported separately; the value is right but its citation isn't.
- **Retry rate** = results that needed the schema retry ÷ all results. A pass after a retry is still a pass.
- Ollama/network errors are infrastructure failures, reported separately, never counted as model failures.
- **Per-field rates** (wrong, `missing`) are ÷ every scored instance of that field: each case whose fields are scored, times k repeats. Cases with no field scoring (§10 document outcomes) don't count.
- **Zero denominators.** Every rate is reported with its numerator and denominator. When the denominator is 0, the rate is reported as `n/a` and passes its threshold, because nothing was asserted, so nothing could be wrong. A run that asserts nothing is caught by the other thresholds instead: an extractor that never finds a value fails the required `missing` threshold, and one that rejects everything fails the wrong-reject count.

| Metric | Threshold |
| --- | --- |
| Schema-valid rate | 100% (hard fail) |
| Hallucination rate | ≤ 2% of found fields (hard fail) |
| Required fields: wrong, per field | ≤ 2% (hard fail) |
| Required fields: `missing`, per field | ≤ 10% |
| Optional fields: wrong, per field | ≤ 5% |
| Optional fields: `missing`, per field | ≤ 20% |
| Missed rejects | 0 |
| Wrong rejects + wrong reject reasons | ≤ 1 on the full set, 0 on smoke |
| Evidence error rate | reported, not gated in v1 |
| Case stability (pass^k) | ≥ 85% of cases |
| Latency p95 per document | first baseline + 25% |

Reject thresholds are counts because the should-reject set is small: with 7 cases, any rate below 100% is a single case.

## 12. Grading examples

Worked examples for every outcome label (G- field, D- document, C- case) are in `spec/examples/grading-examples.md`. They're kept out of this file so it can be handed to a blind grader without giving away answers.

## 13. Open questions

| Question | Current default |
| --- | --- |
| "At most one optional field wrong" lets a `taxAmount` with a tax line missing (risk R-9, S2) pass the case if it's otherwise clean. Acceptable? | Yes; the optional-wrong threshold catches it in aggregate |
| Line items in scope | No (stretch) |
| Threshold for rejecting a PDF as `unreadable` when ingest still produces Private Use Area or U+FFFD characters (see `docs/decisions.md`, PDF parser) | Set in Phase 1 from real counts; record the count in source metadata either way |
