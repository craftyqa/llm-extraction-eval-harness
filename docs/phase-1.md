# Phase 1: System under test

*Draft · 2026-10-10*

**Goal:** a small, working extraction app: good enough to be useful, simple enough to have real weaknesses.

## What was built

| Deliverable | Where |
| --- | --- |
| Ingest: PDF (MuPDF), CSV and text, with the pre-model rejects `empty`, `too_large`, `unreadable` | [`src/ingest/`](../src/ingest/) |
| Chunking and BM25 retrieval per field, merged into passages; `--no-retrieval` for whole-document mode | [`src/retrieve/`](../src/retrieve/) |
| Extraction: Ollama call with a Zod-generated JSON schema, one retry on schema errors, normalisation (SPEC §4), grounding and offsets (SPEC §5), `RunMeta` | [`src/extract/`](../src/extract/) |
| Prompts: `extract.v1` (baseline), `extract.v2`, `extract.v3` (default) | [`prompts/`](../prompts/) |
| CLI with config precedence: flags > env vars > `config.default.json`; exit 0 / 2 / 1 | [`src/cli/extract.ts`](../src/cli/extract.ts) |
| 282 unit tests, no Ollama needed (`npm test`) | `src/**/*.test.ts` |
| 10 live integration tests against Ollama (`npm run test:live`) | [`src/pipeline.live.test.ts`](../src/pipeline.live.test.ts) |

**Done-when check:** `npm run -s extract -- spec/examples/01-classic/source.pdf` with `qwen2.5:7b-instruct` and `extract.v2` returned a schema-valid result with all 11 fields found, correct and grounded, no retry, in 60 s. `npm test` passes without Ollama; `npm run test:live` passes on both `llama3.2:3b` and `qwen2.5:7b-instruct`. The check was moved from a generated sample to EX-01 (#53).

## Key decisions

The full list is in the [decision log](decisions.md), #45 to #54. The ones that shaped the code:

- **A PDF is never `empty`** (#45). Without OCR a blank page and a scan look the same, so both are `unreadable`. The unmapped-glyph limit (0.5% of visible characters) was set from real counts and closes the SPEC §13 question.
- **Flat model output** (#49). Every field is always present as `{ status, reason, evidence }`; the app checks consistency. Output still invalid after the retry throws `MalformedOutputError`, so the SPEC §5 contract didn't change.
- **Fix the prompt, not the normalisers** (#50). v1 copied labels into `raw`; strict normalisation turned those into `unparseable`. v2 fixed it with a worked example on an invented invoice. v1 stays as the baseline.
- **One defaults file** (#51). `config.default.json` feeds the CLI, the tests and, later, the eval runner.
- **`too_large` is decided before the call** (#52, #54). See below.

## What the live runs found

Unit tests with a fake model passed throughout. Every finding below came from running against real Ollama.

- **v1 → v2.** On the 7 golden examples, v1 got 28/55 fields right and v2 48/55 (one run each, hand-counted with the SPEC §8 rules). v2 was written after looking at v1's failures on the same examples, so this is a development score, not evidence. Still wrong in v2: `total` taken from the amount due on EX-02 and EX-05 (R-1, S1), `subtotal` missed three times, and EX-07 rejected as `multiple_documents` instead of `out_of_scope`.
- **Ollama truncates silently.** A prompt over `num_ctx` is cut to fit and only the cut count is reported (7,466 tokens became 1,704). A check after the call can't see it, and the first version of `too_large` relied on one. Ollama 0.40 has no tokenizer endpoint, so the check is now an over-estimate before the call.
- **Qwen tokenizes digits one by one.** The first over-estimate held on `llama3.2:3b` and failed on `qwen2.5:7b-instruct` for digit-heavy text: the space between two numbers costs a whole token. Running the live tests on the production model, not just the fast one, is what caught it.

The useful lesson: mocked tests showed the code did what I thought; only the live runs showed whether what I thought was true.

## Closing the open items

Resolved after the phase check, on 2026-10-11:

- **Multi-page PDFs** are tested: pages are joined in order, each followed by a blank line (#55).
- **Retrieval sizing.** At 800 / 100 / k 3, retrieval kept 95–100% of every example, so it was whole-document mode. A model-free grid picked 300 / 75 / k 2: the smallest setting that keeps all 54 expected quotes, with 85% of the text kept. The settings moved to `config.default.json` and `RunMeta` (#55).
- **Prompt v3** is the default (#56). Over 3 seeds it made no wrong or hallucinated values (v2: 9), and got 20/21 document outcomes (v2: 18/21).
- **Temperature 0.2** is decided (#56). Across seeds, 4 of 55 field labels changed; temperature 0 was no more accurate.

## Still open

- **Missed fields.** v3 still misses `subtotal` on EX-02, EX-03 and EX-05, `dueDate` on EX-03 and EX-06, and `invoiceDate` and `customerName` on EX-05, on every seed and with retrieval off too. The v3 subtotal wording didn't help. These are safe failures (missing, not wrong). More prompt work on the same 7 examples would be fitting to the test; it waits for the Phase 2 dataset and the Phase 3 scorecard.
- **v3 retries more:** 4 of 21 runs needed the retry (v2: 0). Watch the retry rate on the scorecard.
- **Retrieval on or off by default** stays a Phase 3 decision. One whole-document run did worse on rejects (EX-02 wrongly rejected), but a single run on 7 examples doesn't settle it.
- **All numbers here come from the dev examples** that v2 and v3 were written against.

## Next

Phase 2: the golden dataset. A seeded generator, 40 hand-reviewed cases across 7 partitions, the coverage matrix and the dataset tests.
