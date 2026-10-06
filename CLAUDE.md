# CLAUDE.md

Guidance for Claude Code in this repo. Start with `README.md` for the overview.

## Git: never commit

**Never create commits.** The user reviews every change and is the only one who commits. This also rules out amending, pushing, tagging, rebasing, merging, and opening PRs. Leave all changes in the working tree, and tell the user what changed so they can review it. Read-only git commands (`status`, `diff`, `log`, `show`) are fine.

## Project

A local LLM extraction app for Canadian supplier invoices, and an evaluation harness around it. The harness is the main deliverable; the app stays deliberately simple. Phase 0 (spec) is nearly done; there is no code yet.

| File | Role |
| --- | --- |
| `spec/SPEC.md` | Grading spec. **Source of truth** for fields, normalisation, output contract, matchers, grading and thresholds |
| `spec/risks.md` | Risk list (R-1…R-14) with severities and coverage |
| `spec/examples/` | Golden examples EX-01…EX-07, worked grading examples, blind-grade answer key |
| `spec/blind-grade/` | Blind-grade pairs BG-1…BG-5 and grader instructions |
| `docs/specs.md` | Project plan: phases, stack, repo layout, cross-cutting decisions |
| `docs/decisions.md` | Decision log |

## Working rules

- **The user writes the core logic by hand:** extraction, validation, scorers and the CI gate. For these, Claude scaffolds, reviews and explains, but doesn't write the implementation unless the user explicitly asks.
- **Don't duplicate the spec.** Link to `spec/SPEC.md` sections instead of restating rules elsewhere, so documents can't drift apart. A grading-rule change goes in SPEC.md first.
- **Log decisions.** A new or changed decision gets a row in `docs/decisions.md`: date, choice, reason. Superseded rows stay in the log, marked as superseded.
- **Keep SPEC.md blind-grade safe.** It's handed to a blind grader, so it must not contain answers to the blind-grade pairs. Worked examples go in `spec/examples/grading-examples.md`.
- **Don't change `expected.json` or `baseline.json`** unless the user asks; they only change through a reviewed PR.
- **Never edit a prompt file in place.** Add a new version (`extract.v2.md`, …).
- **Synthetic data only.** No real personal or company data anywhere, including traces and reports.
- **Grounding uses MuPDF text.** For `spec/examples/`, that's `source.mupdf.txt`; the `unpdf` and `pdftotext` files are for comparison only.
- **Byte-exact fixtures.** Don't reformat source text, `expected.json` quotes or `.txt` fixtures; whitespace and line endings affect quote offsets.

## Planned stack (Phase 1+)

Node 24 LTS, TypeScript strict (`noUncheckedIndexedAccess`), ESM, `tsx`, ESLint + Prettier, Vitest, Zod v4, Ollama (`qwen2.5:7b-instruct` locally, `llama3.2:3b` in CI), `mupdf`, Promptfoo, GitHub Actions, OpenTelemetry → Arize Phoenix. Unit tests must run without Ollama; mock model calls.
