# Worked grading examples

Companion to [`SPEC.md`](../SPEC.md): one or more worked examples for every outcome label. Section numbers (§) refer to SPEC.md.

**Keep this file away from blind graders.** The blind-grade test gives the second grader only SPEC.md, the documents and the outputs; several examples here are the answers to blind-grade pairs.

All examples use the golden cases in this folder (EX-01 to EX-07). "Actual" is a hypothetical model output for one field; every other field is assumed correct and grounded unless stated.

### Field examples (G-)

| ID | Case · field | Actual (raw / quote) | Value | Grounding | Note |
| --- | --- | --- | --- | --- | --- |
| G-01 | EX-01 · invoiceNumber | `INV-2026-04817` / `INV-2026-04817` | correct | grounded | Baseline. |
| G-02 | EX-03 · vendorName | `KEYSTONE PACKAGING DISTRIBUTORS LTD.` / same | correct | grounded | Matcher ignores case and `Ltd`. |
| G-03 | EX-02 · vendorName | `Tidewater Analytics` / `Tidewater Analytics — Morgan Ellery` | correct | grounded | Matches a listed alternative. |
| G-04 | EX-02 · total | not_found | correct_absent | — | The gross total is never printed. |
| G-05 | EX-02 · dueDate | `2026-09-30` / `2026-09-30` | hallucinated | grounded | "Due on receipt" isn't a date; the issue date was copied. Grounded but still a hallucination. Optional field. |
| G-06 | EX-02 · total | `$5,474.00` / `Total $5,474.00` | hallucinated | ungrounded | Computed (4,910 − 150 + 714). Required → case fails. |
| G-07 | EX-02 · total | `$4,474.00` / `$4,474.00` | hallucinated | grounded | Amount due taken as total. Decoy hit. Required → case fails. |
| G-08 | EX-03 · total | `2,943.73` / `2,943.73` | wrong_value | grounded | Balance due after deposit. Decoy hit. Required → case fails. |
| G-09 | EX-03 · taxAmount | one item: `154.16` / `154.16` | wrong_value | grounded | GST only, PST dropped. Decoy hit. Optional. |
| G-10 | EX-01 · customerName | `Fundy Ridge Fabrication — Plant 2` / same | wrong_value | grounded | Ship-to entity; token-set rejects the extra tokens. Required → case fails. |
| G-11 | EX-01 · vendorTaxId | not_found | missing | — | Doesn't fail the case; counts against the optional missing threshold. |
| G-12 | EX-01 · total | `$1,290.65` / `Total Due: $1,290.65` | correct | ungrounded | The quote paraphrases the label (adds a colon, drops `(CAD)`), so it isn't verbatim. Evidence error, not a hallucination; case still passes. |
| G-13 | EX-05 · dueDate | items `October 21, 2026` / `Due by October 21, 2026` and `10/21/2026` / `10/21/2026` | correct | grounded | Both raws normalise to `2026-10-21`. |
| G-14 | EX-03 · total + amountDue | total `2,943.73`, amountDue `3,443.73` | wrong_value ×2 | grounded | Swapped: both fields wrong, both decoy hits. |
| G-15 | EX-05 · customerName | `Driftwood Cafe & Bakery` / `Driftwood Café & Bakery` | correct | ungrounded | Value matches (accents removed), but raw isn't a substring of the quote. Evidence error. |
| G-16 | EX-06 · invoiceDate | `April 3, 2026` / `Date 03/04/2026`, value `2026-04-03` | hallucinated | ungrounded | Ambiguous under SPEC §4: the written due date and "Net 30" don't count. The model reformatted the date, so raw isn't in the quote. (Had it returned raw `03/04/2026`, the app's normaliser would have produced `not_found` / ambiguous: `correct_absent`.) Required → case fails. |
| G-17 | EX-06 · subtotal | `2 546,00 $` / `Sous-total / Subtotal 2 546,00 $`, value `254600.00` | wrong_value | grounded | Decimal comma read as a thousands separator: a 100× error. Decoy hit. |

### Document examples (D-)

| ID | Case | Actual | Outcome | Field scoring |
| --- | --- | --- | --- | --- |
| D-01 | EX-01 | extracted | correct_extract | Normal |
| D-02 | EX-04 | rejected `out_of_scope` | correct_reject | None |
| D-03 | EX-04 | rejected `unsupported_language` | wrong_reject_reason | None. English labels are present, so the language check passes. |
| D-04 | EX-02 | rejected `out_of_scope` ("it's a bill, not an invoice") | wrong_reject | 9 × `missing`; dueDate and total `correct_absent` |
| D-05 | EX-04 | extracted | missed_reject | None. Non-Canadian parties. |
| D-06 | EX-01 | output missing the `currency` key after one retry | malformed | 11 × `missing`; schema hard fail |
| D-07 | EX-05 | rejected `multiple_documents` | wrong_reject | The remittance slip repeats the same invoice number, so it's one invoice. 11 × `missing`. |
| D-08 | EX-07 | rejected `out_of_scope` | correct_reject | None. A statement that only lists other invoices. |
| D-09 | EX-07 | rejected `multiple_documents` | wrong_reject_reason | None. It lists invoices but contains none; `out_of_scope` also takes precedence. |
| D-10 | EX-07 | extracted | missed_reject | None. |

### Case examples (C-)

| ID | Case | Field results | Passes? | Why |
| --- | --- | --- | --- | --- |
| C-01 | EX-03 | G-09, everything else correct | yes | One optional wrong is allowed; still counts against the optional threshold. |
| C-02 | EX-03 | G-09 + amountDue wrong | no | Two optional fields wrong. |
| C-03 | EX-01 | G-11 + G-12 | yes | Missing and evidence errors don't fail a case. |
| C-04 | EX-02 | G-06 | no | Required field wrong (and ungrounded). |
| C-05 | EX-03 | G-14 | no | Required field `total` wrong. |
| C-06 | EX-06 | invoiceDate `not_found`, everything else correct | yes | Abstaining on an ambiguous date is `correct_absent`. |
| C-07 | EX-03 | taxAmount `154.16` with quote `GST (5%): 154.16` (not verbatim), everything else correct | no | Rule 3: a found field is both ungrounded and wrong. Rule 4 alone would allow it (one optional wrong), and the grounded version passes (C-01). |
