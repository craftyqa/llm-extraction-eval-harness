# EX-04 · Vandermolen Componenten — EU invoice (should reject)

Dutch vendor (B.V.) billing a Swedish customer (AB) in EUR, with Dutch/English labels and a reverse-charge VAT note.

**Expected:** `rejected` / `out_of_scope`

**Why `out_of_scope`:** it's a valid invoice, but neither party is Canadian, so it's outside the system's scope. Under the refusal rules, a non-Canadian vendor or customer → `out_of_scope`.

**Why not `unsupported_language`:** every label has an English version (`Factuurnummer / Invoice no.`). The language rule asks whether the labels are in English, alone or alongside another language, and here they are. So the language check passes and precedence moves on to `out_of_scope`. Returning `unsupported_language` is `wrong_reject_reason` (D-03).

**If it's extracted anyway:** that's `missed_reject` (D-05), and no fields are scored. It would look plausible, which is what makes it dangerous:
- `€ 4.250,90` would normalise to `4250.90` under the decimal-comma rule
- currency would come back `not_found`, because EUR isn't CAD/USD
- the VAT numbers would fail `FMT-3`

**Extractor note:** `source.mupdf.txt` (mupdf 1.28.1) is the reference text. Like EX-01, this PDF uses the Inter font: unpdf emits Private Use Area code points for 16 punctuation characters (`-`, `)`, `+`, `:`, `×`), while MuPDF extracts them correctly. Second ingest regression fixture for that problem.

**Useful for later:** this is the only sample with European number formatting (`€ 2.248,00`: dot for thousands, comma for decimals). It exercises the same normaliser path as the French-Canadian `1 234,50 $`, so keep it as a normaliser fixture even though the case rejects.
