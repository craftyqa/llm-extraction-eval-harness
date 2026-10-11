# LLM Extraction Eval Harness

A small LLM document-extraction app, and a full evaluation harness around it. The app pulls fields out of Canadian supplier invoices using a local model. The harness answers the question that matters: **how do you know it's working, and how do you stop it getting worse?**

The app is deliberately simple. The harness is the point: a written quality bar, a golden dataset, layered scoring, adversarial tests, a CI quality gate and tracing.

> **Status:** Phase 0 (spec and quality bar) is complete, including the blind-grade test. Phase 1 (system under test) is complete: the pipeline from ingest through retrieval and extraction (Ollama call, normalisation, grounding, retry), a CLI, unit tests and live integration tests against Ollama; see [`docs/phase-1.md`](docs/phase-1.md). Phase 2 (golden dataset) is next. Commands below marked *planned* describe the target design from [`docs/specs.md`](docs/specs.md).

## Contents

- [The problem](#the-problem)
- [Part 1: the extraction app](#part-1-the-extraction-app)
- [Part 2: the eval harness](#part-2-the-eval-harness)
- [Development setup](#development-setup)
- [Repo layout](#repo-layout)
- [Roadmap](#roadmap)
- [Stack](#stack)
- [Licence](#licence)
- [Further reading](#further-reading)

## The problem

An accounts-payable clerk at a Canadian company uploads a supplier invoice. The system pre-fills the AP entry form; the clerk reviews it and approves it for payment.

A blank field costs the clerk a minute. A plausible wrong value can get approved and paid. So:

> **Wrong is worse than missing. The system should abstain rather than guess.**

Every design and grading rule in this repo follows from that one sentence. The full grading spec is [`spec/SPEC.md`](spec/SPEC.md).

## Part 1: the extraction app

### What it extracts

Eleven fields per invoice. Every key is always present in the output, as either `found` (with a value and evidence) or `not_found`.

| Field | Required | Notes |
| --- | --- | --- |
| `invoiceNumber` | yes | Never a PO, order, account or tax-registration number |
| `invoiceDate` | yes | `YYYY-MM-DD`; ambiguous dates like `03/04/2026` → `not_found` |
| `dueDate` | no | Printed dates only; "Net 30" is not a due date |
| `vendorName` | yes | The issuer, never the remit-to party, lockbox or factoring company |
| `vendorTaxId` | no | GST/HST number only (`123456789RT0001`) |
| `customerName` | yes | Bill-to, never ship-to or a contact person |
| `currency` | yes | `CAD` or `USD`; a bare `$` is CAD |
| `subtotal` | no | Sum of line amounts, before discounts, shipping and tax |
| `taxAmount` | no | Sum of all sales-tax lines (GST+PST, GST+QST or HST) |
| `total` | yes | Gross total of *this* invoice, including tax |
| `amountDue` | no | What the customer is asked to pay now, after deposits, payments and prior balances |

### Scope

- **In:** invoices (whatever the title: "Bill", "Facture / Invoice"), combined statement/invoices with their own invoice number and current charges, Canadian vendor and customer, English or bilingual EN/FR labels, CAD or USD, GST/HST/PST/QST.
- **Rejected with a reason:** `empty`, `too_large`, `unreadable` (e.g. a PDF with no text layer), `unsupported_language` (no English labels), `out_of_scope` (receipts, quotes, credit notes, pure statements of account, non-Canadian parties), `multiple_documents`.
- **Not supported:** OCR, UI or HTTP API, hosted model APIs, document types other than invoices.

### How it works

```
file ──► ingest ──► chunk + retrieve ──► model call ──► validate ──► normalise ──► evidence check ──► ExtractionResult
         (MuPDF,     (BM25, or            (Ollama,      (Zod,        (app code)    (quote grounded
          csv, txt)   --no-retrieval)      JSON schema)  1 retry)                   in source?)
```

Two design choices carry most of the weight:

1. **The model copies; the app computes.** The model returns each value exactly as printed (`raw`) plus a verbatim `quote` from the document. App code normalises amounts (`1 234,50 $` → `1234.50`) and dates, so number and date handling is deterministic and unit-tested rather than left to the model.
2. **Every found value carries evidence.** The app checks that the quote occurs in the ingested text and that the raw value occurs in the quote. A value that can't be grounded is visible as such, not silently trusted.

```ts
type FieldResult<T> =
  | { status: "found"; value: T; evidence: Evidence[] }
  | { status: "not_found"; reason?: "absent" | "ambiguous" | "conflicting" | "unparseable" };

type Evidence = { raw: string; quote: string; start: number | null; end: number | null; grounded: boolean };
```

The full output contract is in [SPEC §5](spec/SPEC.md#5-output-contract).

### Usage

```sh
npm run -s extract -- invoice.pdf [--model qwen2.5:7b-instruct] [--prompt extract.v2] [--no-retrieval] [--seed 42] [--temperature 0.2]
```

Prints an `ExtractionResult` as JSON on stdout; diagnostics go to stderr. Exit code `0` = extracted, `2` = rejected, `1` = error (bad arguments, Ollama unreachable, or output still schema-invalid after one retry). Use `-s` so npm doesn't print its own banner on stdout. Config precedence: CLI flags > env vars (`EXTRACT_MODEL`, `EXTRACT_PROMPT`, `EXTRACT_RETRIEVAL`, `EXTRACT_SEED`, `EXTRACT_TEMPERATURE`, `EXTRACT_NUM_CTX`, `EXTRACT_NUM_PREDICT`) > [`config.default.json`](config.default.json). `OLLAMA_HOST` sets the Ollama address. `npm run -s extract -- --help` lists the options.

A run on a golden example takes about 20–70 s with `qwen2.5:7b-instruct` on the dev machine below.

## Part 2: the eval harness

### What it's meant to show

- **Eval design:** turning "is the extraction good?" into scored, repeatable checks.
- **Testing a non-deterministic system:** measuring variance and using tolerance bands instead of expecting exact matches.
- **Systematic adversarial testing:** prompt injection, field hijacking and reject bypass, with a severity scale and an attack log.
- **CI ownership:** a quality gate that blocks regressions on every pull request without being flaky.
- **Observability:** traces tagged with every version that matters, and a loop that turns failures into new test cases.

### The quality bar (done)

[`spec/SPEC.md`](spec/SPEC.md) is the single source of truth and is self-contained, so a grader needs only the spec, the documents and the outputs.

**Grading has two independent axes per field:**

| Value outcome | Meaning |
| --- | --- |
| `correct` | Found, and matches the expected value |
| `correct_absent` | Expected `not_found`, got `not_found` |
| `wrong_value` | Found, but doesn't match |
| `missing` | Expected a value, got `not_found` |
| `hallucinated` | Expected `not_found`, got a value |

…and, for found fields, **grounded** or **ungrounded**. This separates "right value, bad citation" from an invented value.

**Matchers:** exact for IDs, dates and currency; integer cents for amounts; a token-set matcher for names that tolerates case, accents, `&`/`and`, legal suffixes and a single OCR error, but rejects extra tokens, so `Saltmarsh Provisions DC` doesn't match `Saltmarsh Provisions Inc.` ([SPEC §8](spec/SPEC.md#8-matchers)).

**Model-free rules:** `XF-1` subtotal + tax = total, `XF-2` due date ≥ invoice date, `FMT-*` format checks ([SPEC §9](spec/SPEC.md#9-rules-model-free-predicates)).

**Thresholds** (initial, revised after the first baseline):

| Metric | Threshold |
| --- | --- |
| Schema-valid rate | 100% (hard fail) |
| Hallucination rate | ≤ 2% of found fields (hard fail) |
| Required field wrong, per field | ≤ 2% (hard fail) |
| Required field missing, per field | ≤ 10% |
| Missed rejects | 0 |
| Case stability (pass^k) | ≥ 85% of cases |

The full table is in [SPEC §11](spec/SPEC.md#11-metrics-and-thresholds).

### Risks (done)

[`spec/risks.md`](spec/risks.md) lists 14 risks with severities: **S1** direct financial loss or fraud, **S2** compliance or significant time cost, **S3** rework. Examples: a balance due taken as the total (R-1, S1), a remit-to lockbox taken as the vendor (R-2, S1), a French-format amount read as 100× (R-4, S1), a day/month swap (R-10, S2). Every golden case is tagged with the risks it exercises, and the coverage check fails if any risk has no case.

### Golden examples (done)

Seven hand-built examples in [`spec/examples/`](spec/examples/), each with the source PDF, `expected.json`, `meta.json` (partition, difficulty, risks, rules the source itself breaks) and notes explaining every expected value.

| Case | Document | Partition | What it tests |
| --- | --- | --- | --- |
| EX-01 | Classic invoice, HST | clean | Baseline; shipping between subtotal and total |
| EX-02 | Sole-proprietor "BILL" | missing fields | Non-"Invoice" title, no printed gross total, retainer deducted |
| EX-03 | Dense ERP invoice, GST+PST | decoys | Deposit vs total, remit-to lockbox, four number-like decoys |
| EX-04 | Dutch vendor, EUR | should-reject | `out_of_scope` despite English labels |
| EX-05 | Utility statement & invoice | decoys | In scope; prior balance vs current charges |
| EX-06 | Bilingual Quebec invoice, GST+QST | messy formatting | Ambiguous date, `2 546,00 $` amounts |
| EX-07 | Statement of account | should-reject | Pure statement; would cause double payment |

Each example also keeps the text from three PDF parsers (`source.mupdf.txt`, `source.unpdf.txt`, `source.pdftotext.txt`). Grounding is checked against the MuPDF text, which is what the app's ingest step produces. Worked examples for every outcome label are in [`spec/examples/grading-examples.md`](spec/examples/grading-examples.md).

### Blind-grade test (done)

Before any code: can someone grade outputs correctly using **only** the spec? Five document + output pairs in [`spec/blind-grade/`](spec/blind-grade/) each target one edge case. They are graded by me and by a second grader (a person, or a fresh LLM session with no project context) who gets only `SPEC.md`. Every disagreement becomes a spec fix or a new worked example. See [`spec/blind-grade/README.md`](spec/blind-grade/README.md) for the procedure.

> If you plan to act as a blind grader, stop here: don't read `spec/examples/`, `spec/risks.md`, `docs/` or `evals/`.

### Scoring layers *(planned, Phase 3)*

Cheapest and most trustworthy first:

1. **Deterministic:** schema valid, required keys present, evidence grounded, `XF-*`/`FMT-*` rules hold.
2. **Field matching:** the SPEC §8 matchers, as pure unit-tested TypeScript functions.
3. **LLM judge:** grounding and refusal correctness, from a different model family than the extractor. The judge is calibrated against ≥ 50 hand labels; if Cohen's κ < 0.7 it's reported but not gated on.

Runs repeat each case k = 5 times with varying seeds and report pass rate and **pass^k** per case. Comparisons (prompt v1 vs v2, 3B vs 7B, retrieval vs whole-document) report per-case flips and McNemar's test, and say plainly which differences are within noise.

```sh
npm run eval              # → reports/<date>-<sha>/scorecard.{json,md}   (planned)
npm run coverage-matrix   # fails if any risk has zero cases             (planned)
```

Unit tests (`npm test`) need no Ollama; model calls are mocked. See [Development setup](#development-setup).

### Adversarial tests *(planned, Phase 4)*

Indirect prompt injection in the body, footer, CSV cells, white-on-white PDF text, metadata and zero-width characters, plus data leakage, jailbreaks and resource abuse. Success is detected deterministically (canary token, attacker value in a field, reject bypass). Every successful attack goes in `redteam/attack-log.md` with before/after results and becomes a regression case.

### CI quality gate *(planned, Phase 5)*

| Workflow | Trigger | Suite | Repeats |
| --- | --- | --- | --- |
| `pr.yml` | pull request | lint, typecheck, unit tests, ~10 smoke cases + adversarial regressions | k = 3 |
| `nightly.yml` | daily + manual | full dataset + red-team generation | k = 5 |

The gate compares each run to a committed baseline using a per-metric tolerance band (`max(2σ over the last 5 nightlies, one case's worth)`). Schema failures, S1/S2 attack regressions and the hallucination threshold are hard fails. The result is posted as a sticky PR comment.

### Observability *(planned, Phase 6)*

OpenTelemetry spans for each pipeline stage, sent to a self-hosted Arize Phoenix container. Spans are tagged with app version, model digest, prompt hash and dataset version. Failures found in traces are promoted to golden cases, so one failure can be followed end to end: trace → new case → fix commit → green gate.

## Development setup

**Prerequisites:** Node 24 (pinned in [`.nvmrc`](.nvmrc); a version manager such as [fnm](https://github.com/Schniz/fnm) or nvm picks it up) and [Ollama](https://ollama.com/download).

```sh
npm install

# Models (Ollama must be running; it serves http://localhost:11434)
ollama pull qwen2.5:7b-instruct   # local extraction model, 4.7 GB
ollama pull llama3.2:3b           # CI model, 2.0 GB
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc` type-check only; `tsx` runs the code, so there's no build step |
| `npm run lint` | ESLint with type-aware `typescript-eslint` rules |
| `npm run format` / `format:check` | Prettier; skips `spec/`, `data/` and Markdown so byte-exact fixtures and prompts are never reformatted |
| `npm test` / `test:watch` | Vitest unit tests; no Ollama needed |
| `npm run test:live` | Live integration tests against Ollama (default model `llama3.2:3b`, override with `LIVE_MODEL`); plumbing, not quality; about a minute |
| `npm run -s extract -- <file>` | Extract one file (needs Ollama); see [Usage](#usage) |

The ingest tests use the PDFs and `source.mupdf.txt` files in `spec/examples/` as fixtures.

## Repo layout

Current:

```
.nvmrc                Node version (24)
package.json          scripts and pinned dev dependencies
tsconfig.json         strict, noUncheckedIndexedAccess, ESM (nodenext), noEmit
eslint.config.js      ESLint flat config + typescript-eslint (strictTypeChecked)
.prettierrc.json      Prettier config; .prettierignore protects fixtures
vitest.config.ts      Vitest config
config.default.json   extraction defaults: model, prompt, retrieval, Ollama options
.gitattributes        byte-exact fixtures: no line-ending conversion under spec/examples/, spec/blind-grade/, data/
docs/
  specs.md            project plan: phases, stack, cross-cutting decisions
  decisions.md        decision log: date, choice and reason for each decision
  phase-0.md          Phase 0 write-up
  phase-1.md          Phase 1 write-up
spec/
  SPEC.md             grading spec (source of truth)
  risks.md            risk list with severities and coverage
  examples/           EX-01…EX-07 golden examples, worked grading examples, blind-grade answer key
  blind-grade/        BG-1…BG-5 pairs, grader instructions, grading sheet, results
src/
  ingest/             ingest(path) → text + source metadata, or a reject; pdf.ts (MuPDF), csv.ts, text.ts, types.ts
  retrieve/           chunk.ts (paragraph/line-aware chunks), retrieve.ts (BM25 per field → merged passages)
  extract/            extract.ts (pipeline + retry), schema.ts (Zod → Ollama format), normalise.ts, grounding.ts, ollama.ts, prompt.ts, config.ts
  cli/                extract.ts: the CLI (flags > env vars > config.default.json)
prompts/
  extract.v1.md       first extraction prompt, kept as the baseline
  extract.v2.md       current default: value-only raw, worked example (decision #50)
```

Planned additions: `data/` (40-case golden dataset and seeded generator), `evals/` (Promptfoo config, scorers, scorecard, gate), `redteam/`, `reports/` and `.github/workflows/`. See [`docs/specs.md`](docs/specs.md#repo-layout).

## Roadmap

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 | Spec and quality bar: SPEC, risks, golden examples, blind-grade test | Done |
| 1 | System under test: ingest, retrieval, extraction, CLI, unit tests | Done |
| 2 | Golden dataset: 40 cases across 7 partitions, seeded generator, coverage matrix | Not started |
| 3 | Evaluation layer: scorers, LLM judge with κ calibration, variance, scorecard | Not started |
| 4 | Adversarial and guardrail tests | Not started |
| 5 | CI quality gate | Not started |
| 6 | Observability and feedback loop | Not started |
| 7 | Case-study write-up and demo | Not started |

Phases 0–3 make a complete project on their own; 4–6 deepen it.

## Stack

Everything runs locally and costs nothing.

| Layer | Choice |
| --- | --- |
| Runtime | Node 24 LTS, TypeScript (strict), `tsx` |
| Lint and format | ESLint (flat config) + `typescript-eslint`, Prettier |
| Model runtime | Ollama: `qwen2.5:7b-instruct` locally, `llama3.2:3b` in CI |
| Output contract | Zod v4 → JSON Schema → Ollama `format` |
| PDF text | `mupdf` (WebAssembly; chosen over `unpdf`, which mis-mapped punctuation in EX-01 and EX-04) |
| Tests and evals | Vitest, Promptfoo |
| CI | GitHub Actions |
| Tracing | OpenTelemetry → Arize Phoenix |

Latency numbers only mean something on known hardware, so versions and the dev machine are recorded here.

**Versions** (exact dependency versions are pinned in `package.json` and the lockfile):

| Tool | Version |
| --- | --- |
| Node | 24.21.0 (npm 11.19.0) |
| TypeScript | 6.0.3, not 7: `typescript-eslint` doesn't support 7 yet (decision #32 in [`docs/decisions.md`](docs/decisions.md)) |
| ESLint / `typescript-eslint` | 10.12.0 / 8.71.1 |
| Prettier | 3.9.9 |
| Vitest | 5.0.3 |
| `tsx` | 4.23.15 |
| `mupdf` / `csv-parse` | 1.28.1 / 7.0.3 |
| Zod / fast-check | 4.6.5 / 4.10.2 |
| Ollama | 0.40.0 |
| `qwen2.5:7b-instruct` | 4.7 GB, digest `sha256:845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e` |
| `llama3.2:3b` | 2.0 GB, digest `sha256:a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72` |

Model digests come from Ollama's `/api/tags` (`ollama list` shows only the first 12 characters). A changed digest means the model changed, even under the same tag.

**Dev machine:**

| Part | Spec |
| --- | --- |
| CPU | Intel Core i5-13420H |
| RAM | 16 GB (15.7 GB usable) |
| GPU | NVIDIA GeForce RTX 4050 Laptop, 6 GB VRAM (driver 610.88) |
| OS | Windows 11 Home (10.0.26200) |

With Ollama's default 4,096-token context, `llama3.2:3b` runs fully on the GPU (~80 tokens/s warm). `qwen2.5:7b-instruct` doesn't fit in 6 GB of VRAM, so about 18% runs on the CPU (~24 tokens/s warm); a larger `num_ctx` moves more of it to the CPU. A cold model load takes about 7–12 s.

## Licence

Repo code is MIT (see [`LICENSE`](LICENSE)). The PDF dependency, MuPDF, is **AGPL-3.0**. That's acceptable for a local CLI that isn't distributed or hosted; it should be revisited if the app is ever offered as a service. See decision #18 in [`docs/decisions.md`](docs/decisions.md).

All documents in this repo are synthetic. No real personal or company data.

## Further reading

- Hamel Husain, [Your AI product needs evals](https://hamel.dev/blog/posts/evals/)
- Eugene Yan, [Task-specific LLM evals](https://eugeneyan.com/writing/evals/), [Product evals](https://eugeneyan.com/writing/product-evals/), [LLM evaluators](https://eugeneyan.com/writing/llm-evaluators/)
- Shankar et al., [Who validates the validators?](https://arxiv.org/pdf/2404.12272)
- Simon Willison, [The lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
