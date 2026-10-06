# EX-07 · Northshore Electrical Wholesale — statement of account (should reject)

Nova Scotia wholesaler sending a month-end statement to a contractor. It lists a balance forward, a payment, three invoices and a credit memo, with aging buckets and a remittance slip. Blind-grade document #4 (statement that should be rejected).

**Expected:** `rejected` / `out_of_scope`

**Why `out_of_scope`:** a statement of account isn't an invoice. It has no invoice number of its own and no charges of its own; every charge on it belongs to an invoice that was sent separately (`77-104512`, `77-104733`, `77-105020`). Paying from it would pay those invoices a second time if they're also entered individually (R-5).

**Contrast with EX-05:** EX-05 is also titled as a statement, but it has its own invoice number (`S-2609-114872`) and its own current charges with tax. That's the line the scope rule draws: own invoice number + current charges → invoice; only a list of other invoices → statement.

**Why not `multiple_documents`:** the document *mentions* three invoice numbers, but it doesn't *contain* three invoices; it contains none. Precedence decides it anyway: `out_of_scope` comes before `multiple_documents`. Returning `multiple_documents` is `wrong_reject_reason` (D-09).

**Why not `unsupported_language` or anything earlier:** English, has a text layer, small.

**If it's extracted anyway:** that's `missed_reject` (D-10), and no fields are scored. It would look plausible:
- invoiceNumber would be one of the listed invoices (`77-105020`?) or the account number `NSE-20417` (R-6)
- total / amountDue would be `6093.18` (the balance due, including a past-due amount) or the last invoice's `2309.94` (R-1)
- invoiceDate would be the statement date `2026-09-30`
- vendorTaxId `866301147RT0001` and customerName `Tern Island Builders Inc.` would be correct, which makes the whole extraction look trustworthy

**Arithmetic (for reference):** 3,412.88 − 2,000.00 + 1,846.21 + 642.60 − 118.45 + 2,309.94 = 6,093.18. Aging: current 4,680.30 (September activity) + 31–60 days 1,412.88 (unpaid balance forward) = 6,093.18.

**Extractor note:** `source.mupdf.txt` (mupdf 1.28.1) is the reference text; `source.unpdf.txt` is kept for comparison. There's no pdftotext file for this case.
