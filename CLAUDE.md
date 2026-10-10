# CLAUDE.md

Guidance for Claude Code in this repo. Start with `README.md` for the overview.

## Git: never commit

**Never create commits.** The user reviews every change and is the only one who commits. This also rules out amending, pushing, tagging, rebasing, merging, and opening PRs. Leave all changes in the working tree, and tell the user what changed so they can review it. Read-only git commands (`status`, `diff`, `log`, `show`) are fine.

## Project

A local LLM extraction app for Canadian supplier invoices, and an evaluation harness around it. The harness is the main deliverable; the app stays deliberately simple.

**Status:** Phase 0 (spec) is done. Phase 1 (system under test) is in progress: repo tooling and local Ollama are set up, and `src/ingest/` is a skeleton of types, stubs that throw `Not implemented`, and tests written ahead of the code (open cases are `it.todo`). The phase checklists are in `docs/specs.md`.

| File | Role |
| --- | --- |
| `spec/SPEC.md` | Grading spec. **Source of truth** for fields, normalisation, output contract, matchers, grading and thresholds |
| `spec/risks.md` | Risk list (R-1…R-14) with severities and coverage |
| `spec/examples/` | Golden examples EX-01…EX-07, worked grading examples, blind-grade answer key |
| `spec/blind-grade/` | Blind-grade pairs BG-1…BG-5, grader instructions and results |
| `docs/specs.md` | Project plan: phases, stack, repo layout, cross-cutting decisions |
| `docs/decisions.md` | Decision log |
| `docs/phase-N.md` | Phase write-ups |
| `src/ingest/` | `ingest(path)` → text + source metadata, or an `empty` / `too_large` / `unreadable` reject (SPEC §7) |

## Working rules

- **The user writes the core logic by hand:** extraction, validation, scorers and the CI gate. For these, Claude scaffolds, reviews and explains, but doesn't write the implementation unless the user explicitly asks.
- **Don't duplicate the spec.** Link to `spec/SPEC.md` sections instead of restating rules elsewhere, so documents can't drift apart. A grading-rule change goes in SPEC.md first.
- **Log decisions.** A new or changed decision gets a row in `docs/decisions.md`: date, choice, reason. Superseded rows stay in the log, marked as superseded. Code comments cite decisions by number (`decision #19`).
- **Keep SPEC.md blind-grade safe.** It's handed to a blind grader, so it must not contain answers to the blind-grade pairs. Worked examples go in `spec/examples/grading-examples.md`.
- **Don't change `expected.json` or `baseline.json`** unless the user asks; they only change through a reviewed PR.
- **Never edit a prompt file in place.** Add a new version (`extract.v2.md`, …).
- **Synthetic data only.** No real personal or company data anywhere, including traces and reports.
- **Grounding uses MuPDF text.** For `spec/examples/`, that's `source.mupdf.txt`; the `unpdf` and `pdftotext` files are for comparison only. `extractPdfText` must reproduce `source.mupdf.txt` exactly for every example.
- **Byte-exact fixtures.** Don't reformat source text, `expected.json` quotes or `.txt` fixtures; whitespace and line endings affect quote offsets. `.gitattributes` marks `spec/examples/`, `spec/blind-grade/` and `data/` as `-text`, and `.prettierignore` skips them.

## Commands

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc`, type-check only (`noEmit`; `tsx` runs the code) |
| `npm run lint` | ESLint, `typescript-eslint` `strictTypeChecked` |
| `npm run format` / `format:check` | Prettier; skips `spec/`, `data/` and all Markdown |
| `npm test` / `test:watch` | Vitest; no Ollama needed |

Planned: `test:live` (needs Ollama), `extract`, `eval`, `coverage-matrix`.

## Code conventions

- ESM with explicit `.ts` import extensions (`import { ingest } from "./ingest.ts"`).
- Tests sit next to the code as `*.test.ts`. Unit tests must run without Ollama; mock model calls.
- A deliberately unused parameter starts with `_`.
- Use `node:path` for paths; the dev machine is Windows and CI is Linux.

## Stack

Installed: Node 24 LTS, TypeScript 6.0.x strict (`noUncheckedIndexedAccess`; not 7, decision #32), ESM, `tsx`, ESLint + Prettier, Vitest, `mupdf`, `csv-parse`. Ollama runs locally with `qwen2.5:7b-instruct` (local) and `llama3.2:3b` (CI); pinned digests are in the README.

Planned: Zod v4, Promptfoo, fast-check, GitHub Actions, OpenTelemetry → Arize Phoenix.
