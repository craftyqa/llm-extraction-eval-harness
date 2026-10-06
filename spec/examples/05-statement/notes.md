# EX-05 · Coastal Gas & Propane — statement & invoice

Utility-style bill from a New Brunswick vendor. HST 15%. It shows account activity (previous balance, payments, credits) and current charges, with a tear-off remittance slip.

| Field | Expected | Why |
| --- | --- | --- |
| *(document)* | `extracted` | **Scope rule:** a document with its own invoice number and current charges is an invoice, even if it also shows account activity. A statement that only lists other invoices is `out_of_scope`. The tear-off slip repeats the same invoice number, so it's one invoice, not `multiple_documents`. |
| invoiceNumber | `S-2609-114872` | Decoys: `Account Number 300-48127-06` and the delivery numbers `DL-77120` / `DL-77854`. |
| invoiceDate | `2026-09-30` | Labelled **Statement Date**. For combined statement/invoices, the statement date is the invoice date. The billing-period start `2026-09-01` is a decoy. |
| dueDate | `2026-10-21` | Printed twice: `October 21, 2026` and `10/21/2026` on the slip. Either quote is grounded, and both normalise to the same value. |
| vendorName | `Coastal Gas & Propane Services` | The remit-to `Coastal Gas & Propane — Payment Processing` is a decoy (R-2). |
| vendorTaxId | `841027716RT0001` | `HST Reg. 84102 7716 RT0001`. |
| customerName | `Driftwood Café & Bakery` | Has an accent. The matcher removes accents, so `Driftwood Cafe & Bakery` is `correct`. |
| currency | `CAD` | Bare `$`, Canadian vendor. |
| subtotal | `1007.99` | Equals the sum of the current-charge lines. |
| taxAmount | `151.20` | HST 15%. |
| total | `1159.19` | **Total Current Charges**: the gross total of *this* invoice. `1134.19` (total amount due) and `612.44` (previous balance) are decoys. |
| amountDue | `1134.19` | Total Amount Due: previous balance − payments − $25 credit + current charges. |

**Rules:** `XF-1` holds (1,007.99 + 151.20 = 1,159.19), the only sample where it does. `XF-2` holds.

**Normaliser note:** `−$612.44` uses U+2212, but `-$25.00` on the next line uses an ASCII hyphen. Both must parse as negative.

**Extractor note:** `source.mupdf.txt` (mupdf 1.28.1) is the reference text. MuPDF puts the vendor's address and HST number near the **end** of the text, after the remittance slip, because of how the page is laid out. The vendorTaxId quote is still grounded, but retrieval and the model can't assume header facts appear first.
