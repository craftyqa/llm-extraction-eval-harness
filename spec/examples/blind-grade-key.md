# Blind-grade answer key

Answers for `spec/blind-grade/` BG-1 to BG-5. **Keep this file away from blind graders**, and grade the pairs yourself before reading it.

Each pair targets one edge case from the Phase 0 plan. Every other field in the output is correct and grounded, so the target is the only thing being tested. "Likely disagreements" are where the spec might not be clear enough; that's what the test is looking for.

## BG-1 · correct extraction (document: EX-01)

- **Expected:** extract. **Document outcome:** `correct_extract`.
- **Fields:** all 11 `correct`, all `grounded`. vendorTaxId `81427 3390 RT0001` → `814273390RT0001`; amountDue is the same printed figure as total.
- **Case passes:** yes.
- **Likely disagreements:**
  - `XF-1` fails on this document (1,074.30 + 168.35 ≠ 1,290.65, because of $48.00 shipping). A grader may treat that as a failure. It isn't one: the case-pass rules (§10) don't include rules, and the source itself breaks `XF-1`. But the blind grader doesn't have `meta.json` (`violatesRules`), so §9 may read as if it matters.
  - Whether `$1,290.65` is both the total and the amount due. §3: when nothing is deducted or added, they're the same printed figure.

## BG-2 · "balance due" taken as total (document: EX-03)

- **Expected:** extract. **Document outcome:** `correct_extract`.
- **Fields:**
  - total: expected `3443.73` (INVOICE TOTAL CAD), actual `2943.73` (BALANCE DUE) → `wrong_value`, `grounded`, decoy hit.
  - amountDue: `2943.73` → `correct`, `grounded`.
  - The other 9 fields: `correct`, `grounded`. taxAmount is GST + PST = `360.53` with two evidence items. invoiceDate `09/22/2026` → `2026-09-22` (22 > 12).
- **Case passes:** no. Rule 2: a required field (`total`) is wrong.
- **Not a hallucination:** it's `wrong_value` and grounded, so it doesn't count toward the hallucination rate (§11).
- **Likely disagreements:** whether the deposit makes BALANCE DUE the "total". §3 says total excludes deposits.

## BG-3 · ambiguous date (document: EX-06)

- **Expected:** extract (bilingual with English labels → language check passes; both parties Canadian). **Document outcome:** `correct_extract`.
- **Fields:**
  - invoiceDate: expected `not_found` / ambiguous (`03/04/2026`, both components ≤ 12, no other `NN/NN/YYYY` date in the document). Actual `2026-04-03` → `hallucinated`. **Ungrounded:** raw `April 3, 2026` isn't in the quote `Date 03/04/2026` (§5, condition 2).
  - The other 10 fields: `correct`, `grounded`. Amounts in French format (`2 546,00 $` → `2546.00`); taxAmount is GST + QST = `381.26`; dueDate written month `May 3, 2026` → `2026-05-03`.
- **Case passes:** no. Rule 2 (a required field is wrong) and rule 3 (a found field is ungrounded and wrong).
- **Counts toward the hallucination rate.**
- **Likely disagreements:**
  - Inferring DD/MM from the due date plus Net 30 (April 3 + 30 days = May 3), or from the Quebec location. §4 says only a date in the same numeric format counts and never to compute. A grader who accepts the inference will grade invoiceDate `correct`.
  - Whether the reformatted raw counts as ungrounded. §5 says raw must occur in the quote.

## BG-4 · statement of account (document: EX-07)

- **Expected:** reject `out_of_scope` (a statement that only lists other invoices, §2). **Actual:** reject `multiple_documents`.
- **Document outcome:** `wrong_reject_reason`. No fields scored.
- **Case passes:** no. Rule 1.
- **Likely disagreements:**
  - "It lists three invoice numbers, so it's multiple documents." §2 defines `multiple_documents` as more than one invoice *contained* in the file, each with its own total. The statement contains none. Even if both applied, precedence (§7) puts `out_of_scope` first.
  - Whether it's a combined statement/invoice (in scope). It has no invoice number and no charges of its own, so it isn't.

## BG-5 · GST + PST invoice, only GST extracted, ungrounded quote (document: EX-03)

- **Expected:** extract. **Document outcome:** `correct_extract`.
- **Fields:**
  - taxAmount: expected `360.53` (GST 154.16 + PST 206.37), actual `154.16` → `wrong_value`, decoy hit. **Ungrounded:** the quote `GST (5%): 154.16` isn't verbatim (the source has `GST 5%` then `154.16`; no parentheses or colon).
  - The other 10 fields: `correct`, `grounded`.
- **Case passes:** no. Rule 3: a found field is ungrounded and wrong. (Rule 4 alone would have allowed it: it's the only wrong optional field.)
- **Counts toward the hallucination rate** (ungrounded and not correct).
- **Likely disagreements:**
  - Passing the case under rule 4 ("only one optional field wrong") and missing rule 3.
  - Grading the quote as grounded because the numbers match. §5 requires the verbatim quote.

## Summary

| Pair | Document outcome | Target field → outcome / grounding | Case |
| --- | --- | --- | --- |
| BG-1 | correct_extract | all correct / grounded | pass |
| BG-2 | correct_extract | total → wrong_value / grounded | fail (rule 2) |
| BG-3 | correct_extract | invoiceDate → hallucinated / ungrounded | fail (rules 2, 3) |
| BG-4 | wrong_reject_reason | — | fail (rule 1) |
| BG-5 | correct_extract | taxAmount → wrong_value / ungrounded | fail (rule 3) |
