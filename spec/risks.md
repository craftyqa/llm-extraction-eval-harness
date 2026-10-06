# Risk list

Version 0.1.0 · 2026-10-06 · @Jen

What can go wrong for the AP clerk (SPEC §1), how bad it is, and what catches it. Every golden case tags the risks it exercises in `meta.json` (`risks`). From Phase 2, `npm run coverage-matrix` generates the coverage from those tags and fails if any risk has zero cases.

**Severity:** **S1** direct financial loss or fraud · **S2** compliance or significant time cost · **S3** rework.

| ID | Risk | Fields | Sev | Caught by |
| --- | --- | --- | --- | --- |
| R-1 | Wrong total (e.g. balance due, amount after deposit, or prior balance taken as total) → overpayment or underpayment | total, amountDue | S1 | Amount matcher; `decoys`; `XF-1` |
| R-2 | Remit-to, lockbox, bank or factoring company taken as vendor → payment to the wrong party | vendorName | S1 | Token-set matcher (rejects extra tokens); `decoys` |
| R-3 | CAD/USD confusion → error the size of the exchange rate | currency | S1 | Exact matcher; `FMT-2` |
| R-4 | French-format amount misread (`1 234,50` → `123450.00`) → 100× error | subtotal, taxAmount, total, amountDue | S1 | Amount normaliser unit tests; amount matcher; `XF-1` |
| R-5 | Non-invoice processed (quote, statement, pro forma, credit note, out-of-scope invoice) → paying something not owed, or paying twice | document | S1 | `missed_reject` (threshold 0) |
| R-6 | Wrong invoice number (PO, order, account or delivery number) → duplicate-payment checks miss it | invoiceNumber | S1 | Exact matcher; `decoys` |
| R-7 | Instructions injected in the document change a field or the reject decision | any | S1 | Phase 4: canary token, field-hijack and reject-bypass checks |
| R-8 | Wrong or invented GST/HST number (e.g. QST or PST number taken instead) → input tax credit claim at risk | vendorTaxId | S2 | Exact matcher; `FMT-3`; `decoys` |
| R-9 | Wrong tax amount (e.g. only GST picked up, PST or QST dropped) → tax-reclaim errors | taxAmount | S2 | Amount matcher; `XF-1`; `XF-3` (stretch) |
| R-10 | Day/month swap, or an ambiguous date guessed → wrong accounting period or wrong due date | invoiceDate, dueDate | S2 | Date rules (ambiguous → `not_found`); exact matcher; `XF-2` |
| R-11 | Invented value presented with confidence → reviewer trusts it | any | S2 | Hallucination rate (hard fail); grounding check |
| R-12 | Valid invoice rejected (e.g. titled "Bill", or a combined statement/invoice) → manual entry, late payment | document | S3 | `wrong_reject` count |
| R-13 | Wrong customer entity (ship-to, contact person or service address) → booked to the wrong company | customerName | S3 | Token-set matcher; `decoys` |
| R-14 | Ingest corrupts or scrambles text (unmapped glyphs, reading order) → values the model can't copy correctly, or quotes that can't be grounded | any | S2 | Ingest regression tests (EX-01, EX-04); PUA/U+FFFD count in source metadata; grounding check |

## Coverage in `spec/examples/` (2026-10-06)

| Risk | Cases | Gap |
| --- | --- | --- |
| R-1 | EX-01, EX-02, EX-03, EX-05, EX-07 | — |
| R-2 | EX-03, EX-05 | No factoring-company case |
| R-3 | — | **No USD invoice.** Needs at least one USD case, and one with a `$` that a careless reader could take as USD |
| R-4 | EX-06 | EX-04 has European format but rejects |
| R-5 | EX-04, EX-05, EX-07 | No quote, pro forma or credit note |
| R-6 | EX-01, EX-03, EX-05, EX-07 | — |
| R-7 | — | Phase 4 (adversarial partition) |
| R-8 | EX-03, EX-06 | — |
| R-9 | EX-03, EX-06 | — |
| R-10 | EX-03, EX-06 | No case where another date in the same format resolves the order |
| R-11 | EX-02, EX-06 | — |
| R-12 | EX-02, EX-05 | — |
| R-13 | EX-01, EX-03 | — |
| R-14 | EX-01, EX-04 | — |

R-3 and R-7 have no cases yet; both must be covered before the Phase 2 coverage-matrix check can pass.
