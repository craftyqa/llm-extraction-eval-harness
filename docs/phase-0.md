# Phase 0: Spec and quality bar

*Draft · 2026-10-06*

**Goal:** define "good" before writing code, so every later phase has something to test against.

## What was built

| Deliverable | Where |
| --- | --- |
| Grading spec: scope, fields, normalisation, output contract, refusal rules, matchers, grading, thresholds | [`spec/SPEC.md`](../spec/SPEC.md) |
| Risk list, R-1 to R-14, with severities | [`spec/risks.md`](../spec/risks.md) |
| Seven golden examples, EX-01 to EX-07, with expected outputs, metadata and notes | [`spec/examples/`](../spec/examples/) |
| Worked grading examples for every outcome label | [`spec/examples/grading-examples.md`](../spec/examples/grading-examples.md) |
| Blind-grade test: five pairs, answer key, results | [`spec/blind-grade/`](../spec/blind-grade/) |
| Decision log | [`decisions.md`](decisions.md) |

## Key decisions

The full list is in the decision log. The ones that shaped everything else:

- **Wrong is worse than missing** (#6). The AP pre-fill framing drives the separate thresholds and the abstain-on-ambiguity rules.
- **Two grading axes per field** (#7): value outcome and grounding, so a bad citation isn't confused with an invented value.
- **The model copies, the app computes** (#5). Normalisation is deterministic app code.
- **Token-set name matcher** (#11), replacing Jaro-Winkler, which passed the S1 remit-to and ship-to decoys.
- **MuPDF for PDF text** (#17), replacing unpdf, which corrupted punctuation in two of the seven samples. This also added risk R-14 (#22).

## What the blind grade found

Both graders, me and a fresh LLM session with only SPEC.md, matched the answer key on all five pairs. There were no grading disagreements. The LLM grader still raised 13 questions. Eight of them led to a decision (#24–#31), and seven of those also changed the spec's wording: what counts as a contained invoice, whether grounding changes a field's status, line-level discounts, and others. Details: [`spec/blind-grade/results.md`](../spec/blind-grade/results.md).

The useful lesson: a grader can reach the right answer and still be guessing. The questions mattered more than the grades.

## Still open

- SPEC §13: the rule-4 / R-9 question, line items in scope, and the `unreadable` threshold for PUA/U+FFFD characters (set in Phase 1).
- Plan-level open decisions (judge model, production temperature, retrieval default) are in [`specs.md`](specs.md#decisions).

## Next

Phase 1: the system under test. Ingest, retrieval, extraction, the CLI and unit tests.
