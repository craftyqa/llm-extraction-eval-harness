# Blind-grade results

**Contains answers. Don't give this file to a blind grader.**

Results of the Phase 0 blind-grade test (procedure in [`README.md`](README.md)). Answers are in [`spec/examples/blind-grade-key.md`](../examples/blind-grade-key.md).

## Graders

| Grader | Date | Method | Agreement with the key |
| --- | --- | --- | --- |
| Jen (self) | 2026-10-06 | Graded aloud before reading the key; no written sheet | Matched on all 5 pairs |
| LLM subagent, fresh session | 2026-10-06 | Given only SPEC.md, the five `BG-*` folders and a blank sheet; grounding checked by script | Matched on all 5 pairs |

The LLM grader matched the key on every document outcome, every field's value outcome and grounding, and every case pass/fail result, including the target traps: BG-2 `total` → `wrong_value` (grounded), BG-3 `invoiceDate` → `hallucinated` (ungrounded), BG-4 → `wrong_reject_reason` via the §7 precedence, BG-5 failing on rule 3 rather than passing on rule 4.

**Grading disagreements: 0.**

## Questions raised and how they were resolved

Every question from the grader's "Questions / assumptions" lines, with its resolution. Decision numbers refer to [`docs/decisions.md`](../../docs/decisions.md).

| # | Pair | Question | Resolution |
| --- | --- | --- | --- |
| 1 | BG-1 | One "Total Due (CAD)" line: does it feed both `total` and `amountDue`? | SPEC §3 `amountDue`: a single combined line feeds both (#29) |
| 2 | BG-1, BG-2 | The source breaks `XF-1` (shipping, freight) | Intended. `XF-1` kept, sources list it in `violatesRules`; §13 question closed (#28) |
| 3 | BG-1 | PDF-text artefacts (logo letter, split ship-to name) | No change: they don't affect any extracted field |
| 4 | BG-2 | `subtotal` is "before discounts", but line amounts already include per-line discounts | SPEC §3 `subtotal`: line amounts as printed; "before discounts" means document-level only (#26) |
| 5 | BG-2, BG-3, BG-5 | Decoy hits can't be checked without `expected.json` | SPEC §10 step 3: counted against `expected.json`; a blind grader notes likely decoys (#31) |
| 6 | BG-2 | Do backordered quantities make it `multiple_documents`? | No change: the grader read it correctly; covered by #24's wording |
| 7 | BG-3 | Can a written-month due date plus "Net 30", or a Québec location, settle `03/04/2026`? | No; the spec already said so. SPEC §4 now names these sources explicitly (#30) |
| 8 | BG-3 | Should a failed grounding check change `status` or the normalised value? | SPEC §5: grounding never changes `status` or `value`; the field stays `found` with `grounded: false` (#25) |
| 9 | BG-3 | Is U+202F inside a number whitespace for grounding? | No change: §5 already lists U+202F in the whitespace collapse |
| 10 | BG-3 | A quote that occurs twice in the source (`2 927,26 $`) | No change: §5 uses the first match for offsets; grounding is unaffected |
| 11 | BG-4 | A statement of account literally meets §2's general invoice definition | SPEC §2: the scope table takes precedence over the general definition (#27) |
| 12 | BG-4 | Do invoices listed on a statement count as "multiple documents"? | SPEC §2: only invoices contained in the file count, not listed or referenced ones (#24) |
| 13 | BG-5 | Is it intended that a grounded GST-only `taxAmount` would pass the case? | Left open in SPEC §13 (rule 4 question). Worked example C-07 added to show that the ungrounded version fails on rule 3 |

## Other changes from the test

- SPEC §6: two wrong cross-references fixed (decoy hits → §10, `violatesRules` → §9).
- `spec/examples/grading-examples.md`: C-07 added (an optional field that's wrong and ungrounded fails the case on rule 3).

## Notes for the next run

- BG-5 uses the same document as BG-2, and the grader spotted it. That's harmless here, but a future pair set should use a different document per pair so one answer doesn't anchor another.
- The LLM grader's filled-in sheet is kept outside the repo.
