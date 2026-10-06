# EX-01 · Harbourline Industrial Supply — classic invoice

New Brunswick vendor, HST 15%, CAD, one page. The baseline: every field is printed and labelled.

| Field | Expected | Why |
| --- | --- | --- |
| invoiceNumber | `INV-2026-04817` | The `Invoice #` label is stripped. `PO-55102` and `C-00931` sit in the same header table and are decoys (R-6). |
| invoiceDate | `2026-09-14` | Written month, so it's unambiguous. |
| dueDate | `2026-10-14` | Explicit date. "Net 30" is also printed, but the explicit date is what counts. |
| vendorName | `Harbourline Industrial Supply Inc.` | Issuer in the header. The bank in "Payment by EFT" is a decoy. |
| vendorTaxId | `814273390RT0001` | `81427 3390 RT0001` with spaces removed. |
| customerName | `Fundy Ridge Fabrication Ltd.` | BILL TO. The SHIP TO name `Fundy Ridge Fabrication — Plant 2` is a decoy (R-13), and the old Jaro-Winkler matcher scored it 0.95 (a pass). |
| currency | `CAD` | From `Total Due (CAD)`. |
| subtotal | `1074.30` | Equals the sum of the line amounts. |
| taxAmount | `168.35` | HST is charged on subtotal + shipping (15% × 1,122.30). |
| total | `1290.65` | `Total Due` — there are no deductions, so total and amountDue are the same printed figure. |
| amountDue | `1290.65` | Same figure as total. |

**Rules:** `XF-1` fails in the source: 1,074.30 + 168.35 ≠ 1,290.65 because of the $48.00 shipping line. `XF-2` holds.

**Extractor note:** in the pdftotext output, `Total Due (CAD)` and `$1,290.65` are on different lines, so a quote of `Total Due (CAD) $1,290.65` is **ungrounded**. See grading example G-12.
