# EX-06 · Traductions Rivière-Bleue — bilingual invoice with an ambiguous date

Quebec translation agency billing an Ontario customer. Bilingual EN/FR labels, GST 5% + QST 9.975%, French-Canadian amounts (`2 546,00 $`). Blind-grade document #3 (ambiguous date).

| Field | Expected | Why |
| --- | --- | --- |
| *(document)* | `extracted` | Every label has an English version, so the language check passes. Both parties are Canadian. |
| invoiceNumber | `RB-26-147` | `Facture n° / Invoice No.` is a label and is stripped. Decoys: `PO No. LMD-4471`, `Client No. 10-882`, and the product code `IFU-220` in the project line. |
| invoiceDate | `not_found` / ambiguous | `03/04/2026`: both components ≤ 12 and they differ. There's no other `NN/NN/YYYY` date in the document. The due date `3 mai 2026 / May 3, 2026` is a written month, a different format, so it **doesn't** decide the order. Neither does "Net 30" (that would be computing) nor the Quebec location (no locale inference). `2026-03-04` and `2026-04-03` are both `hallucinated` (G-16). |
| dueDate | `2026-05-03` | Written month, unambiguous. Printed in French and English; either raw is fine, and both normalise to the same value. |
| vendorName | `Traductions Rivière-Bleue Inc.` | Header. The bank in the payment line is a decoy. |
| vendorTaxId | `784152290RT0001` | `TPS/GST n° 78415 2290 RT0001`. The `TVQ/QST n° 1218843307 TQ0001` is a Quebec sales-tax number, not this field (R-8). |
| customerName | `Lakeshore Medical Devices Ltd.` | `FACTURER À / BILL TO`. `Dana Whitfield` is the contact person. |
| currency | `CAD` | Bare `$`, after the amount as is usual in French. |
| subtotal | `2546.00` | `2 546,00 $` → decimal comma (2 digits after the last `,`), space as thousands separator. Reading it as `254600.00` is the R-4 100× error. |
| taxAmount | `381.26` | **GST 127.30 + QST 253.96**, two evidence items. GST alone is `wrong_value` (R-9). |
| total | `2927.26` | `Total`. |
| amountDue | `2927.26` | `Montant dû / Amount due`, same figure as total. |

**Rules:** `XF-1` holds (2,546.00 + 381.26 = 2,927.26). `XF-2` can't be checked because invoiceDate isn't found.

**Why this case matters:** every hint in the document points one way (DD/MM → April 3, and April 3 + 30 days = May 3). A model or a grader that "works it out" returns a plausible, probably right, value, but the spec says to abstain. If the blind grader disagrees, that's exactly the disagreement this case is meant to surface.

**Extractor notes:**
- `source.mupdf.txt` (mupdf 1.28.1) is the reference text; `source.unpdf.txt` is kept for comparison. There's no pdftotext file for this case.
- The amounts use U+202F (narrow no-break space) as the thousands separator and U+00A0 before `$`. **MuPDF keeps both** (unpdf turns them into ordinary spaces). The expected quotes use plain spaces and are grounded only because the grounding check treats U+00A0 and U+202F as whitespace (SPEC §5). A model that copies the exact characters is also grounded.
- The `PO No.` label wraps across lines (`Bon de commande / PO` / `No.` / `LMD-4471`). That doesn't affect any graded field.
