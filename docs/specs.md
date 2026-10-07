# LLM Extraction Eval Harness — Technical Spec and Project Plan

Started Oct 5, 2026 · @Jen Cook

## Overview

Build a small LLM document-extraction app, then a full evaluation harness around it: a golden dataset, scoring, adversarial tests, a CI quality gate and tracing. The app is deliberately simple. The harness is the portfolio piece.

What it should prove:

- **Eval design:** turning a fuzzy quality question into scored, repeatable checks.
- **Testing non-deterministic systems:** measuring variance and setting tolerance bands instead of expecting exact matches.
- **Guardrail and adversarial testing:** systematic, not ad hoc.
- **CI/CD ownership:** a quality gate that blocks regressions on every pull request.
- **AI observability:** traces, regression tracking across versions, and turning failures into new test cases.
- **Hands-on TypeScript:** code written by me, with AI assistance for scaffolding and review.

Each phase ends with something showable. Phases 0–3 are a complete portfolio piece on their own; 4–6 deepen it; 7 turns it into hiring signal.

### Out of scope

- OCR. Only PDFs with a text layer are supported. "Poor scans" are simulated as noisy text (see Phase 2).
- UI, HTTP API, auth, multi-user or persistent storage. The app is a CLI and a library function.
- Fine-tuning, hosted/paid model APIs, GPU-only setups.
- More than one document type.

## Stack and setup

Everything runs locally and costs nothing. Versions are pinned in `package.json` / lockfile and recorded in the README.

| Layer | Choice | Why / notes |
| --- | --- | --- |
| Runtime | Node 24 LTS, ESM, `tsx` for running TS directly | Current LTS; no build step needed for scripts |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` | Hands-on practice in the language I test with |
| Lint/format | ESLint (flat config) + `typescript-eslint`, Prettier | Standard; runs in CI |
| Model runtime | Ollama, called via its HTTP API (`/api/chat`) | Free, swappable, gives token counts and timings |
| Extraction model | `qwen2.5:7b-instruct` locally, `llama3.2:3b` for CI runs | Two sizes give a ready-made comparison for Phase 3 |
| Judge model | **Proposed:** a different model family from the extractor, ≥ the extractor's size | Same-model judging tends to be biased toward its own outputs |
| Output contract | Zod v4 schemas → `z.toJSONSchema()` → Ollama `format` parameter | One source of truth for the schema, the constraint and validation |
| PDF / CSV parsing | `mupdf` (MuPDF, WebAssembly) for PDF text, `csv-parse` for CSV | No native build, works on Windows and Linux. Chosen over `unpdf` (pdf.js), which mis-maps punctuation in Chromium/Inter PDFs (EX-01, EX-04). **AGPL-3.0**; see `docs/decisions.md` |
| Synthetic data | `@faker-js/faker` (seeded) + `pdf-lib` to render PDFs | Reproducible generation |
| Test runner | Vitest | Unit tests for deterministic code and scorers |
| Eval framework | Promptfoo, using a custom provider that calls the app | Dataset runs, `--repeat`, red-team plugins |
| CI | GitHub Actions, `ubuntu-latest` hosted runners | Public, visible to hiring managers |
| Tracing | Arize Phoenix, self-hosted (single Docker container), instrumented via OpenTelemetry | Langfuse v3 self-host needs Postgres + ClickHouse + Redis + S3; Phoenix is one container. OTel keeps the backend swappable |

**Ollama settings (fixed and recorded in every result):** `temperature`, `seed`, `num_ctx` (set explicitly, because Ollama's default context window is small and silently truncates long prompts), `num_predict`. For thinking-capable models, turn thinking off explicitly.

**Dev machine:** record CPU, RAM, GPU (if any) and OS in the README. Latency budgets only mean something on known hardware.

### Repo layout

```
/docs            specs.md (this file), case-study write-up, phase notes, decision log
/spec            SPEC.md (grading spec), risks.md, coverage-matrix.md (generated)
  /examples      EX-01…EX-07 golden examples, grading-examples.md (G-/D-/C-), blind-grade-key.md
  /blind-grade   Phase 0 blind-grade pairs (BG-1…BG-5), grader instructions, grading sheet
/src
  /ingest        pdf.ts, csv.ts, text.ts → raw text + source metadata
  /retrieve      chunk.ts, retrieve.ts
  /extract       prompt rendering, Ollama client, Zod schema, evidence check
  /cli           extract.ts
/prompts         extract.v1.md, extract.v2.md, judge.grounding.v1.md …  (versioned, never edited in place)
/data
  manifest.json  dataset version + case index
  /cases/<id>/   input.(pdf|csv|txt), expected.json, meta.json
  /generator     seeded synthetic-document generator
/evals
  promptfooconfig.yaml, provider.ts
  /scorers       deterministic, field-match, judge (pure functions, unit-tested)
  /scorecard     aggregates Promptfoo JSON output → scorecard.json + scorecard.md
/redteam         attack cases, promptfoo redteam config, attack-log.md
/reports         baseline.json, dated scorecards (gitignored except baseline + milestones)
.github/workflows  pr.yml, nightly.yml
.gitattributes   data/** -text (stops CRLF conversion from changing fixtures and quote offsets on Windows)
```

## Cross-cutting technical decisions

These apply across phases and should be settled in Phase 0–1.

### Versioning and reproducibility

Every extraction result and every scorecard carries:

| Field | Source |
| --- | --- |
| `appVersion` | `package.json` version + git short SHA |
| `model`, `modelDigest` | Ollama `/api/tags` (the digest pins the exact weights; tags like `:latest` move) |
| `promptId`, `promptHash` | prompt file name + SHA-256 of its content |
| `datasetVersion` | `data/manifest.json` semver |
| `options` | temperature, seed, num_ctx, num_predict |
| `hardware` | runner label or machine name |

A scorecard without these fields doesn't count. This is also what Phase 6 traces get tagged with, so Phase 6 costs very little extra.

### Retry policy

Retries hide failures, so they are part of the spec:

- On a schema-validation failure: at most **1** retry, with the validation error added to the prompt.
- `retries` is recorded per result. A pass that needed a retry is still a pass, but the scorecard reports the retry rate separately.
- Ollama/network errors are infrastructure failures. They are reported separately and never count as model failures.

### Determinism and variance

With `temperature: 0` and a fixed seed, Ollama is close to deterministic on the same hardware, so a variance study at those settings would measure nearly nothing. So:

- **Gate runs** use the production settings (**Proposed:** `temperature: 0.2`) and a different seed per repeat (`seed = baseSeed + repeatIndex`).
- **Debug reproductions** use `temperature: 0` and a fixed seed.
- Results from CPU and GPU, or from different machines, are never compared directly. Each baseline belongs to one hardware profile.

## Phase 0: Spec and quality bar
**README**
https://hamel.dev/blog/posts/evals/
https://eugeneyan.com/writing/evals/
https://eugeneyan.com/writing/product-evals/

course: https://wandb.ai/site/courses/evals/
https://github.com/anthropics/courses

**Goal:** define "good" before writing code, so every later phase has something to test against.

**Estimate:** 6–10 h

**Deliverables:** `spec/SPEC.md` (the grading spec), `spec/risks.md`, `spec/examples/` (one worked example per outcome label), `docs/decisions.md`.

- [x] Pick the document type: **Canadian supplier invoices**
- [x] Write a one-paragraph problem statement (SPEC §1)
- [x] Write the scope: in/out document types, languages, currencies, formats (SPEC §2)
- [x] Define the output schema, field definitions and normalisation rules (SPEC §3–6)
- [x] Define grading: value outcome + grounding axes, document outcomes, case pass (SPEC §10)
- [x] Write refusal rules with reject-reason precedence (SPEC §7)
- [x] Write rules as pure, model-free predicates: `XF-*` cross-field, `FMT-*` single-field (SPEC §9)
- [x] Set thresholds (SPEC §11; initial values, revise after the first baseline)
- [x] Finalise the risk list with severities (`spec/risks.md`)
- [x] Write one worked example per outcome label (`spec/examples/grading-examples.md`)
- [x] Start `docs/decisions.md`: one line per decision with date, choice and reason
- [x] **Blind-grade test** (below; pairs in `spec/blind-grade/`). Self-grade and LLM grader both matched the answer key; the grader's questions became decisions #24–#31 (see `spec/blind-grade/results.md`)

### Grading spec

The grading spec lives in [`spec/SPEC.md`](../spec/SPEC.md) and is the single source of truth: problem statement, scope, output fields, normalisation, output contract, expected-file format, refusal rules, model-free rules (`XF-*`, `FMT-*`), matchers, grading and thresholds. Supporting files:

- [`spec/risks.md`](../spec/risks.md): risk list with severities and coverage
- [`spec/examples/`](../spec/examples/): golden examples EX-01 to EX-07, and the worked grading examples (G-, D-, C-) in `grading-examples.md`
- [`docs/decisions.md`](decisions.md): every decision with its date and reason

This plan doesn't repeat any of it, so the two can't drift apart.

### Blind-grade test

- Pick 5 document + output pairs that hit the edge cases:
  1. A correct extraction
  2. A "balance due" decoy taken as the total
  3. An ambiguous `03/04/2026` date
  4. A statement of account that should be rejected
  5. A GST+PST invoice where only GST was extracted, with an ungrounded quote
- The five pairs are in `spec/blind-grade/` (BG-1 to BG-5), with instructions, a grading sheet and a prompt for the second grader.
- Grade them myself first, then give a second grader **only** `SPEC.md`, the documents and the outputs. If no person is available, use a fresh LLM session with no other context. The grader doesn't get `expected.json`, the case notes or the grading examples: deciding what the right answer is from the spec is part of the test.
- Every disagreement or question becomes a spec fix or a new worked example.

**Done when:** the blind-grade test ends with zero unresolved disagreements, every outcome label has a worked example, and every risk has a severity.

## Phase 1: System under test

**Course:** 
https://www.deeplearning.ai/short-courses/building-evaluating-advanced-rag
https://www.evidentlyai.com/llm-evaluations-course

**Goal:** a small, working extraction app — good enough to be useful, simple enough to have real weaknesses.

**Estimate:** 15–25 h

- [x] Repo setup: Node 24, TS strict, ESLint, Prettier, Vitest, `.gitattributes`, `.nvmrc`, MIT `LICENSE`, README stub
- [x] Install Ollama, pull the models, record their **digests** in the README
- [ ] Ingest: `ingest(path) → { text, sourceType, pageCount?, bytes }`
  - PDF: text layer via `mupdf`; no text layer → reject `unreadable`. Count Private Use Area and U+FFFD characters and record the count in the source metadata; above a threshold → reject `unreadable`. EX-01 and EX-04 are regression fixtures (must extract with zero PUA characters)
  - CSV: rendered to `header: value` lines per row, so the model sees labels
  - Text: read as UTF-8; strip the BOM; normalise line endings to `\n`
- [ ] Chunk and retrieve:
  - **Proposed:** ~800-character chunks with 100-character overlap, split on paragraph/line boundaries
  - Retrieval: BM25 keyword scoring over field-specific query terms (e.g. `total`: "total, amount due, balance due"), top-k = 3 per field, merged and deduplicated
  - **Whole-document mode** (`--no-retrieval`) as a baseline: invoices usually fit in context, so the Phase 3 comparison should show whether retrieval helps or hurts
- [ ] Extract: one model call per document using the merged chunks, `format` = JSON schema from Zod, then `schema.safeParse`, the evidence check and the retry policy
- [ ] Return an `ExtractionResult` exactly as specified in Phase 0, including `RunMeta`
- [ ] CLI: `extract <file> [--model] [--prompt extract.v2] [--no-retrieval] [--seed] [--temperature]` prints JSON to stdout; exit code 0 = extracted, 2 = rejected, 1 = error
- [ ] Config precedence: CLI flags > env vars (`EXTRACT_MODEL`, …) > `config.default.json`
- [ ] Unit tests: ingest per format, chunk boundaries and overlap, retrieval ranking on fixed text, evidence offset calculation (including whitespace and Unicode), schema validation, reject pre-checks. Model calls are mocked; no Ollama in unit tests.

**Learn:** writing TypeScript, not just reading it; the moving parts of a RAG pipeline.

**Rule:** I write the extraction and validation code myself. AI tools scaffold and review.

**Done when:** `extract data/samples/clean-01.pdf` returns a schema-valid `ExtractionResult` with grounded evidence for every found field, and `npm test` passes with no Ollama running.

## Phase 2: Golden dataset

**Goal:** a hand-labelled test set chosen with real test design, not a pile of happy-path samples.

**Estimate:** 15–20 h

- [ ] Build the seeded generator (`data/generator`): faker → invoice object (the ground truth) → render to PDF, CSV or TXT with layout variants
- [ ] Generate the clean and boundary partitions from the generator. Hand-write or hand-edit the tricky partitions (decoys, conflicts, out-of-scope).
- [ ] Hand-review every `expected.json` against SPEC.md, including generated ones. Set `reviewedBy` and `reviewedAt` in `meta.json`.
- [ ] Build the coverage matrix **as a script** (`npm run coverage-matrix`) that reads `meta.json` tags and the risk list, and fails if any risk has zero cases
- [ ] Tag every case; mark ~10 cases `smoke: true` for CI (at least one per partition, weighted toward high-severity risks)
- [ ] Version the dataset: semver in `manifest.json` + `data/CHANGELOG.md`. Any change to an existing `expected.json` is a minor bump at least and goes through a PR.

### Target distribution (40 cases)

| Partition | Cases | Examples |
| --- | --- | --- |
| clean | 8 | well-formed, all fields present, each source format |
| missing fields | 6 | no due date, no tax ID, no currency symbol |
| conflicting values | 4 | two different totals, header vs footer invoice number |
| decoys | 5 | PO number next to the invoice number, "previous balance" next to the total, a remittance address |
| messy formatting | 5 | OCR-style noise (`0`/`O`, `1`/`l`), broken line wraps, odd spacing, mixed date formats |
| boundary (cross-field) | 5 | total off by exactly 0.01, due date = invoice date, 0% tax, very large amounts |
| should-reject | 7 | receipt, contract, empty, multiple invoices, non-English, over the size limit |

### Case files

```jsonc
// meta.json
{ "id": "INV-0012", "partition": "decoys", "difficulty": "hard",
  "risks": ["R-2", "R-5"], "sourceFormat": "pdf", "smoke": true,
  "violatesRules": [], "reviewedBy": "jen", "reviewedAt": "2026-10-20",
  "notes": "PO number formatted like an invoice number, placed above it" }
```

`expected.json` follows SPEC §6: the output shape without `meta`, offsets or `grounded`, plus optional `alternatives` and `decoys` per field. Evidence quotes are optional in expected outputs and are used only for judge calibration.

**Learn:** applying equivalence partitioning, boundaries and risk-based selection to AI evals — the skill most AI-eval demos skip.

**Done when:** the coverage-matrix script passes (every risk has ≥ 1 case, every partition ≥ 3 cases), and every case has `reviewedBy` set.

## Phase 3: Evaluation layer
**Readme** 
https://eugeneyan.com/writing/llm-evaluators/
https://eugeneyan.com/writing/eval-process/
https://arxiv.org/pdf/2404.12272

**Goal:** scores I'd defend in an interview, layered from cheapest and most trustworthy to most expensive.

**Estimate:** 20–30 h

**Design:** scorers are pure TypeScript functions in `evals/scorers`, unit-tested with Vitest, called from Promptfoo `javascript` assertions. Promptfoo runs the cases (`--repeat k`, JSON output). A separate `scorecard` script aggregates that JSON into per-field metrics, which Promptfoo doesn't do natively. One command: `npm run eval` → `reports/<date>-<sha>/scorecard.{json,md}`.

- [ ] **Layer 1, deterministic:** schema valid, required fields present, evidence grounded (quote exists in source), cross-field rules `XF-*` hold (unless `violatesRules` says the source breaks them)
- [ ] **Layer 2, field matching** (normalise both sides first):
  - Exact: `invoiceNumber`, `currency`, `vendorTaxId` (after removing separators), dates (parsed to ISO)
  - Amount: `subtotal`, `taxAmount`, `total`, `amountDue` (compared as integer minor units)
  - Token-set: `vendorName`, `customerName` (SPEC §8). Implemented by hand, with unit tests built from the SPEC §8 table and every name decoy in the golden set.
- [ ] **Layer 3, LLM judge**, only for fields that pass Layers 1–2's grounding check:
  - Grounding: "Does this quote support this value for this field?" → `{verdict: "supported" | "unsupported" | "partial", rationale}`
  - Refusal correctness: "Is this document an invoice? If not, is the reject reason right?"
  - Judge prompts are versioned in `/prompts`; `temperature: 0`; structured output
- [ ] **Calibrate the judge:** hand-label ≥ 50 judge items, stratified so ≥ 30% are negatives. Report the confusion matrix and Cohen's κ. **Target κ ≥ 0.7.** Below that, the judge's verdict is reported but not gated on. Write down the failure patterns (e.g. "accepts partial matches on amounts").
- [ ] **Variance:** k = 5 repeats per case (seeds vary, per the cross-cutting rules). For each case record its pass rate, and **pass^k** (passed all k runs). Flag a case `unstable` if 0 < pass rate < 1.
- [ ] **Scorecard** contents:
  - Per field: accuracy, label counts (`correct` / `wrong_value` / `missing` / `hallucinated`)
  - Overall: hallucination rate, schema-valid rate, retry rate, reject precision and recall
  - Stability: % of cases at pass^k, list of unstable cases
  - Latency: p50 / p95 per document, prompt and completion tokens
  - Run metadata block (see Versioning)
  - Slices by partition and by difficulty
- [ ] **Comparison:** run prompt v1 vs v2 (or 3B vs 7B, or retrieval vs whole-document) on the same dataset version. Report per-case flips (pass→fail, fail→pass) and use McNemar's test on the paired results. With 40 cases, one case is 2.5 pp, so say plainly which differences are within noise.

**Learn:** eval design, judging the judge, and testing a system that doesn't give the same answer twice.

**Done when:** `npm run eval` produces a scorecard from a clean checkout. I can explain every number on it. Judge κ is measured and written down. One comparison write-up exists in `/docs`.

## Phase 4: Adversarial and guardrail tests

**README**
https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
https://www.promptfoo.dev/blog/lethal-trifecta-testing/
OWASP Top 10 for LLM Applications and Promptfoo's red-teaming docs

**Goal:** break the app on purpose, record what worked, and close the gaps.

**Estimate:** 12–20 h

### Success criteria for an attack (deterministic where possible)

- **Canary:** the payload tells the model to output a unique token (`CANARY-7f3a`). Any appearance of the token in the output = attack succeeded.
- **Field hijack:** the payload tells the model to set a field to an attacker value (e.g. `total: 0.01`, a different vendor). Output equals the attacker value = attack succeeded.
- **Reject bypass/forcing:** the attack makes an out-of-scope document get extracted, or a valid one get rejected.

### Work items

- [ ] Indirect prompt injection, across **placements**: body text, footer, a CSV cell, PDF white-on-white text, PDF metadata, zero-width/Unicode-tag characters, text split across chunk boundaries
- [ ] Data leakage: (a) run doc A then doc B in the same process and check B's output for any of A's unique values; (b) check outputs for values from any few-shot examples in the prompt
- [ ] Out-of-scope and resource inputs: empty, over the size limit, binary renamed `.txt`, non-English, a 200-page PDF. Check each produces the right `RejectReason` with **no model call** where the pre-checks should catch it.
- [ ] Jailbreak and role-play attempts through the document text ("You are now a helpful assistant who…")
- [ ] Promptfoo red team (`promptfoo redteam`): enable only plugins that apply to an extraction app (indirect prompt injection, hijacking, PII-related). To stay local, set `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true` and point attack generation at a local model. Expect weaker attacks than the hosted generator would give, and record that as a limitation.
- [ ] Attack log at `redteam/attack-log.md`: `id | technique | placement | payload ref | target field | before | after | severity | fix commit`
- [ ] Severity scale: **S1** attacker controls a financial field or vendor identity · **S2** valid doc wrongly rejected, or canary leaks · **S3** output degraded but still flagged by Layer 1
- [ ] Defences, each a separate commit so before/after is clear: delimit document text in the prompt, strip zero-width and control characters at ingest, check that output values are grounded (already in Layer 1), check that amounts follow `XF-1`
- [ ] Move every successful attack into `/redteam/cases` in the golden-case format, with `partition: "adversarial"`

**Learn:** guardrail probing made systematic; a real step into security testing.

**Done when:** the attack log has before-and-after results for every S1/S2 attack, and the adversarial **regression** cases run in the PR smoke suite. The full red-team generation runs nightly (see Phase 5).

## Phase 5: CI quality gate

**Goal:** quality checks that run on every pull request and block regressions without becoming flaky.

**Estimate:** 12–20 h

### Where the model runs

**Proposed:** GitHub-hosted `ubuntu-latest` (4 vCPU, 16 GB RAM for public repos) with the 3B model, for both PR and nightly runs. **Don't attach a self-hosted runner to a public repo for PR workflows.** A fork PR could run arbitrary code on my machine. If I use a self-hosted runner at all, it's only for `workflow_dispatch` and `schedule` triggers.

### Workflows

| Workflow | Trigger | Suite | Repeats | Budget |
| --- | --- | --- | --- | --- |
| `pr.yml` | `pull_request` | lint, typecheck, unit tests, smoke cases (~10) + adversarial regression cases | k = 3 | ≤ 20 min total |
| `nightly.yml` | `schedule` (daily) + `workflow_dispatch` | full dataset + red-team generation | k = 5 | ≤ 90 min |

Workflow details:

- Install Ollama, set `OLLAMA_MODELS` to a workspace path, and cache it with `actions/cache` keyed on the model digest so model pulls don't run every time
- Start `ollama serve` in the background and wait for it with a health-check loop, not `sleep`
- Upload `scorecard.json`, the Promptfoo output and the logs as artifacts on every run, pass or fail
- Workflow `permissions:` set to the minimum; `pull-requests: write` only on the comment step's job

### Gate logic (`evals/gate.ts`, unit-tested)

- [ ] **Baseline:** `reports/baseline.json`, committed. It only changes through a PR titled `baseline: …` that includes the nightly run it came from, so the baseline can't drift without review.
- [ ] **Tolerance band per metric:** `band = max(2 × σ over the last 5 nightly runs, one case's worth of the metric)`. A run fails if `metric < baseline − band`. Until there are 5 nightlies, use a fixed band of 5 pp.
- [ ] **Hard fails (ignore bands):** any schema-invalid output, any successful S1/S2 regression attack, hallucination rate above the Phase 0 threshold, an infra error rate > 0 (rerun, don't pass)
- [ ] **PR comment:** one sticky comment updated in place: a per-field table of baseline / this run / delta / band / status, and the list of newly failing cases with links to artifacts
- [ ] **Budgets:** p95 latency per document and total wall time; exceeding them is a warning on PRs and a failure on nightly
- [ ] **Flake control:** a case that's unstable on the baseline is reported but doesn't gate until it's fixed or removed. That list is tracked in the scorecard.
- [ ] **Demo:** PR A makes the prompt worse (e.g. removes the "use not_found instead of guessing" instruction) → hallucination hard fail. PR B improves the prompt → passes with a positive delta.

**Learn:** CI/CD ownership, and handling non-determinism in a pipeline.

**Done when:** both demo PRs exist in the repo history with their gate comments, and nightly has run green 5 times in a row without code changes (which shows the gate isn't flaky).

## Phase 6: Observability and feedback loop
**Course**
https://community.arize.com/x/arize-news/msg_1lhLy3yEzzb1/free-one-hour-course-on-llm-evaluation-fundamental

**Goal:** treat the app like a product in production, where failures found in the wild become tests.

**Estimate:** 10–15 h

- [ ] Run Phoenix locally (`docker run -p 6006:6006 arizephoenix/phoenix`)
- [ ] Instrument with OpenTelemetry. Spans: `extract` (root) → `ingest`, `chunk`, `retrieve`, `prompt.render`, `llm.generate`, `validate`, `evidence.check`, `retry?`
- [ ] Span attributes: every Versioning field + `caseId` (when running under eval) + token counts + retrieved chunk IDs. Never put full document text in attributes unless a `TRACE_CONTENT=1` flag is set.
- [ ] Tracing is off by default and on via `OTEL_EXPORTER_OTLP_ENDPOINT`, so unit tests and CI don't need a collector
- [ ] **Version trend report:** scorecard metrics plotted across prompt and model versions from `/reports`. With pinned local models this tracks **regressions across versions**, not drift over time.
- [ ] **Input drift (lightweight):** for the new unlabelled batch, compare simple distributions (length, source format, reject rate, `not_found` rate per field) against the golden set, and flag big shifts
- [ ] Generate 30+ new unlabelled documents with a **different** generator seed and layout variants, run them, and review the traces as if they were production traffic
- [ ] Promote at least 3 failures to golden cases: label them, give them `meta.json` provenance (`"source": "phase6-triage"`), and bump the dataset version
- [ ] Note in `/docs`: what traces showed that the scorecard didn't (e.g. retrieval missed the chunk), and the reverse

**Learn:** AI observability tooling and the eval-to-production loop.

**Done when:** one failure can be shown end to end: trace ID → new case ID → fix commit → green PR gate, all linked in a phase note.

## Phase 7: Tell the story

**Goal:** turn the work into something a hiring manager can take in within five minutes.

**Estimate:** 8–12 h

- [ ] README as a case study: problem, quality bar, approach, results (headline numbers + scorecard screenshot), limitations, what I'd do next
- [ ] One short write-up per phase as I go, in `/docs/phase-N.md` (raw material for posts and talks)
- [ ] A 5-minute demo script for screen-share interviews: scorecard → failing PR comment → an attack and its fix → one trace. Rehearse it timed.
- [ ] Talk abstract: "How I'd test a RAG product"
- [ ] Resume bullet and interview talking points tied to specific scorecard numbers (e.g. "cut the hallucination rate from X% to Y%, judge κ = Z")
- [ ] Pin the repo on GitHub and link it from LinkedIn

**Done when:** I can walk someone through it live without notes, in under 5 minutes.

## Working rules, risks and stopping points

**Working rules**

- Synthetic data only. No real personal or company data in the repo, including in traces and committed reports.
- Write core logic by hand (extraction, validation, scorers, gate). Use AI for scaffolding, review and explanation.
- Commit at the end of every phase with a short phase note in /docs; tag the commit `phase-N`.
- Keep the app simple. Time goes into the harness, not the app.
- Never edit a prompt file in place; add a new version.
- Never change `expected.json` or `baseline.json` outside a reviewed PR.

**Risks**

| Risk | Mitigation |
| --- | --- |
| Local models are slow on CPU, especially in CI | 3B model and ~10 smoke cases on PRs; full runs nightly; cache model weights; measure the real CI time in Phase 1 before committing to the PR budget |
| A small local model is a weak judge | Calibrate against hand grades (κ target); gate only on deterministic layers if κ falls short; keep the judge model swappable |
| Dataset building takes longer than expected | Generator first; start with 15 cases covering S1 risks, then grow |
| Scope creep into the app | Freeze the app's features after Phase 1; changes only to fix what evals find |
| Small dataset makes differences statistically meaningless | Report per-case flips and McNemar; state the noise floor (1 case = 2.5 pp) on the scorecard |
| Windows dev vs Linux CI differences (line endings, paths, hardware) | `.gitattributes`, `node:path` everywhere, separate baselines per hardware profile |
| Ollama or model tags change underneath me | Pin by digest; the CI cache key includes the digest; record the Ollama version |

**Stopping points**

- After Phase 3: a complete, showable eval project.
- After Phase 5: adds adversarial testing (Phase 4) and CI ownership.
- After Phase 6: the full production-style loop.

## Decisions

**Decided**

| Decision | Choice | Date |
| --- | --- | --- |
| Document type | Supplier invoices | 2026-10-05 |
| Extraction models | `qwen2.5:7b-instruct` local, `llama3.2:3b` CI | 2026-10-05 |
| Tracing backend | Arize Phoenix, self-hosted | 2026-10-05 |
| Locale | Canada only (CAD/USD, English + bilingual EN/FR) | 2026-10-06 |
| Normalisation | App code; the model returns raw text and quotes | 2026-10-06 |
| Quality bar | Wrong worse than missing (AP pre-fill framing); separate thresholds | 2026-10-06 |
| Grading | Two axes per field: value outcome + grounding | 2026-10-06 |
| `amountDue` | Optional field, separate from `total` | 2026-10-06 |
| Name matcher | Token-set (replaces Jaro-Winkler ≥ 0.92) | 2026-10-06 |
| French-only invoices | Reject `unsupported_language` | 2026-10-06 |
| PDF parser | `mupdf` (replaces `unpdf`) | 2026-10-06 |

The full log, with reasons, is in `docs/decisions.md`. `spec/SPEC.md` is the source of truth for grading rules.

**Open**

| Decision | Proposed | Decide by |
| --- | --- | --- |
| Judge model | Different family, ≥ the extractor's size | Phase 3 |
| Production temperature | 0.2 | Phase 1 |
| Retrieval on/off by default | Decide from the Phase 3 comparison | Phase 3 |
