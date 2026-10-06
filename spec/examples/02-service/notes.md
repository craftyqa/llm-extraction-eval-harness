# EX-02 · Tidewater Analytics — service bill

Sole proprietor consultant in New Brunswick billing a Nova Scotia customer. HST 15%. The document is titled **BILL**, not "Invoice".

| Field | Expected | Why |
| --- | --- | --- |
| *(document)* | `extracted` | It's a seller's request for payment with a number, a date and an amount owed, so it's an invoice whatever the title says. Rejecting it as `out_of_scope` is a `wrong_reject` (R-12). |
| invoiceNumber | `TA-0057` | Labelled `BILL NO.`. `CLIENT REF. MRL-2026-Q3` is a decoy. |
| invoiceDate | `2026-09-30` | Labelled `ISSUED`. ISO format. |
| dueDate | `not_found` / absent | "Due on receipt" isn't a date, and the spec says due dates are never computed. Returning `2026-09-30` is `hallucinated` (G-05). |
| vendorName | `Tidewater Analytics — Morgan Ellery` | A sole proprietor's legal name is the person, and the trading name is the business. All three forms are listed as `alternatives`. Under token-set matching, `Tidewater Analytics` on its own would **not** match without them. |
| vendorTaxId | `773102264RT0001` | In the footer (`HST No.`), not the header. Tests that the model reads the whole page. |
| customerName | `Marram Lane Outfitters Co.` | `Priya Castellan` is the contact person, a decoy. |
| currency | `CAD` | Only a bare `$` appears. Canadian vendor, so `$` → CAD by rule. |
| subtotal | `4910.00` | Labelled `Fees`. It's the sum of the lines before the $150 discount, which is the line-item-sum definition. |
| taxAmount | `714.00` | 15% of 4,760.00 (after discount). |
| total | `not_found` / absent | The gross total (4,910 − 150 + 714 = 5,474.00) **is never printed**. Returning `4474.00` takes the amountDue figure; returning `5474.00` is computed. Both are `hallucinated`. |
| amountDue | `4474.00` | `Amount due`, after the $1,000 retainer. It's printed twice; offsets point to the first occurrence. |

**Rules:** `XF-1` can't be checked because total isn't found. Nothing in the source breaks a rule.

**Why this case matters:** a required field (`total`) is legitimately absent. A model that always fills in required fields will fail here, which is the behaviour the asymmetric quality bar is meant to reward.

**Normaliser note:** the discount and retainer lines use U+2212 (`−`), not ASCII `-`.

**Extractor note:** `source.mupdf.txt` (mupdf 1.28.1) is the reference text. The labels use CSS letter-spacing. MuPDF reads them as words (`ISSUED`, `AMOUNT DUE`), but unpdf splits them into letters (`I S S U E D`) and pdftotext does so for some (`S E RV I C E`). Under those extractors, a quote that includes a label is ungrounded. In MuPDF's output, only the `BILL` title stays split (`B I L L`).
