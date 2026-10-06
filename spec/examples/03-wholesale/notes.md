# EX-03 · Keystone Packaging Distributors — wholesale ERP invoice

British Columbia distributor. GST 5% and PST 7% as separate lines. A deposit is deducted from the total. This is the densest decoy case in the set.

| Field | Expected | Why |
| --- | --- | --- |
| invoiceNumber | `0418823` | Leading zero kept. Decoys: `ORDER NO. SO-0392711`, `CUST. PO 7781-PK`, `CUST. NO. MRL001`, `PST # PST-1048-2273` (R-6). |
| invoiceDate | `2026-09-22` | `09/22/2026`: 22 > 12, so the format is MM/DD (date rule 2). |
| dueDate | `2026-10-22` | `10/22/2026`. The "2% 10" early-payment date isn't printed and isn't this field. |
| vendorName | `Keystone Packaging Distributors Ltd.` | Printed in capitals; the matcher lower-cases. The REMIT TO name `… Ltd. — Lockbox 2291` is a decoy (R-2) that the old Jaro-Winkler matcher passed at about 0.93. |
| vendorTaxId | `702198841RT0001` | From `GST # 70219 8841 RT0001`. The `PST #` number is a provincial number, not this field. |
| customerName | `Saltmarsh Provisions Inc.` | Labelled **SOLD TO**, not BILL TO, which is the same concept. `Saltmarsh Provisions DC` (SHIP TO) is a decoy that the old matcher passed at about 0.97. |
| currency | `CAD` | From `INVOICE TOTAL CAD`. |
| subtotal | `2948.20` | Labelled `MERCHANDISE`. Equals the sum of the line extensions. |
| taxAmount | `360.53` | **GST 154.16 + PST 206.37**, so two evidence items. GST alone is `wrong_value` (R-9, G-09). PST is charged on merchandise only; GST also covers freight. |
| total | `3443.73` | `INVOICE TOTAL CAD`. `BALANCE DUE 2,943.73` is the decoy (R-1, G-08). |
| amountDue | `2943.73` | `BALANCE DUE`, after the $500 deposit. Swapping total and amountDue makes **both** fields `wrong_value`. |

**Rules:** `XF-1` fails in the source: 2,948.20 + 360.53 ≠ 3,443.73 because of $135.00 freight. `XF-2` holds.

**Extractor note:** pdftotext joins the SHIPPED and B/O columns on some rows (`8` + `0` → `80`). It doesn't affect any graded field, but line items would be unreliable if they're ever brought into scope.
