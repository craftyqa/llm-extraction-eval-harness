# Decision log

One line per decision: date, choice and reason. Newest at the bottom. Superseded decisions stay in the log, marked as superseded, with a pointer to the decision that replaced them.

| # | Date | Decision | Choice | Reason |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-05 | Document type | Supplier invoices | Familiar domain with clear ground truth, real decoys (PO numbers, remit-to parties, balance due) and a concrete cost of error |
| 2 | 2026-10-05 | Extraction models | `qwen2.5:7b-instruct` local, `llama3.2:3b` CI | Free and local; two sizes give a ready-made comparison for Phase 3; 3B fits the CI time budget |
| 3 | 2026-10-05 | Tracing backend | Arize Phoenix, self-hosted | One Docker container (Langfuse v3 needs Postgres + ClickHouse + Redis + S3); OTel keeps the backend swappable |
| 4 | 2026-10-06 | Locale | Canada only: CAD/USD, English + bilingual EN/FR | One locale keeps the dataset small while still covering GST/HST/PST/QST and French number formats |
| 5 | 2026-10-06 | Normalisation | App code; the model returns raw text and quotes | Deterministic, unit-testable, and keeps the model's job to locating and copying |
| 6 | 2026-10-06 | Quality bar | Wrong is worse than missing; separate thresholds | AP pre-fill framing: a blank field costs a minute, a plausible wrong value can get paid |
| 7 | 2026-10-06 | Grading | Two axes per field: value outcome + grounding | Separates "right value, bad citation" (evidence error) from hallucination |
| 8 | 2026-10-06 | Grading spec location | `spec/SPEC.md` is the source of truth; `docs/specs.md` is the project plan | The blind grader gets one self-contained file |
| 9 | 2026-10-06 | `amountDue` field | Optional field, separate from `total` | Every sample prints both and they differ after deposits, retainers and prior balances; capturing both makes the total/amount-due confusion (R-1) gradeable |
| 10 | 2026-10-06 | Evidence shape | `raw` per evidence item, not per field | A summed `taxAmount` (GST + PST) has no single printed raw; each tax line is its own evidence item |
| 11 | 2026-10-06 | Name matcher | Token-set match with one-edit tolerance on long tokens; replaces Jaro-Winkler ≥ 0.92 | Jaro-Winkler rewards a shared prefix and passed the S1 decoys in the samples: ship-to `… — Plant 2` (0.95), remit-to `… — Lockbox 2291` (~0.93), `Saltmarsh Provisions DC` (~0.97). Token-set rejects all three and has no threshold to tune |
| 12 | 2026-10-06 | French-only invoices | Reject `unsupported_language` | v1 prompts and labels are English; bilingual invoices with English labels stay in scope |
| 13 | 2026-10-06 | Scope: combined statement/invoice | In scope if it has its own invoice number and current charges; a statement that only lists other invoices is `out_of_scope` | Utility-style bills are real invoices (EX-05); pure statements would cause double payment (EX-07) |
| 14 | 2026-10-06 | Scope: parties | Non-Canadian vendor **or** customer → `out_of_scope`; a missing address alone is not a reason to reject | Matches the locale decision (#4); EX-04 |
| 15 | 2026-10-06 | `subtotal` definition | The printed figure equal to the sum of the line amounts, before discounts, shipping, fees and tax; `not_found` if not printed | "Labelled pre-tax figure" was ambiguous when a discount or shipping line sits between subtotal and tax (EX-01, EX-02) |
| 16 | 2026-10-06 | Scoring a `wrong_reject` | Expected-found fields → `missing`; expected-not_found fields → `correct_absent` (same as `malformed`) | The old spec didn't say; matching `malformed` keeps the two failure modes consistent |
| 17 | 2026-10-06 | PDF parser | `mupdf` (MuPDF, WebAssembly); replaces `unpdf` (pdf.js) | `unpdf` emitted Private Use Area characters for 24 punctuation characters in EX-01 and 16 in EX-04 (Inter font alternates in Chromium PDFs), turning `INV-2026-04817` into an unmatchable string. MuPDF extracted all 7 samples with no bad characters and every expected quote grounded. Still no native build |
| 18 | 2026-10-06 | MuPDF licence | Accept AGPL-3.0 for the PDF dependency; repo code stays MIT | Local CLI portfolio project, not distributed or hosted. Must be stated in the README. Revisit if the app is ever offered as a service |
| 19 | 2026-10-06 | Unmapped-glyph guard | Ingest counts PUA and U+FFFD characters, records the count in source metadata, and rejects `unreadable` above a threshold (set in Phase 1) | Catches the next font the parser can't map, instead of passing corrupted text to the model silently |
| 20 | 2026-10-06 | Reference text for examples | `source.mupdf.txt` in each `spec/examples/` case; pdftotext and unpdf output kept for comparison | Grounding is checked against the app's own ingest output, so the reference must come from the same parser |
| 21 | 2026-10-06 | Where worked grading examples live | `spec/examples/grading-examples.md`, not SPEC.md; the blind-grade answer key sits beside it | SPEC.md goes to the blind grader, and several examples were the answers to the blind-grade pairs. Matches the Phase 0 deliverable (`spec/examples/`) |
| 22 | 2026-10-06 | New risk R-14 | Ingest corrupts or scrambles text, S2 | Found with unpdf on EX-01/EX-04; MuPDF reorders EX-05's header. Gives the ingest regression fixtures a risk to trace to |
| 23 | 2026-10-06 | Blind-grade outputs | Hand-written, one target edge case per pair, every other field correct; offsets and `grounded` omitted | Isolates each spec question; real model outputs don't exist until Phase 1 |
