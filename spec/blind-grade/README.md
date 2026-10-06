# Blind-grade test

Phase 0's final check: can someone grade outputs correctly using **only** `spec/SPEC.md`? Every disagreement or open question becomes a spec fix or a new worked example. Phase 0 is done when this test ends with zero unresolved disagreements.

## The pairs

Each folder holds one document and one extraction output.

| Pair | Files |
| --- | --- |
| BG-1 … BG-5 | `document.pdf` (the original), `document.txt` (the app's ingest text: grounding is checked against this), `output.json` (the extraction result) |

Outputs omit `meta`, evidence offsets and `grounded`: deciding grounding is part of the grading. Field `value`s are as the app's normaliser would produce them from each `raw`.

## Procedure

1. **Grade them myself first.** Fill in a copy of `grading-sheet.md` without looking at the answer key or the `spec/examples/` notes.
2. **Second grader.** Give them only:
   - `spec/SPEC.md`
   - the five `BG-*` folders
   - a blank `grading-sheet.md`

   **Don't** give them `spec/examples/` (expected outputs, notes, grading examples), `spec/risks.md`, `docs/`, or the answer key. If no person is available, use a fresh LLM session with no project context and the prompt below.
3. **Compare** both sheets with `spec/examples/blind-grade-key.md`. For every difference, decide whether the spec was unclear or the grader made a mistake.
4. **Resolve:** each spec gap becomes a SPEC.md fix (and a `docs/decisions.md` line) or a new worked example in `spec/examples/grading-examples.md`. Log the results in `results.md` in this folder: grader, date, each disagreement and how it was resolved.

## Prompt for an LLM grader

Attach SPEC.md, the five folders' files and the blank grading sheet, then send:

> You are grading the output of an invoice-extraction system. Use **only** the attached grading spec (SPEC.md); don't rely on outside conventions where the spec decides something.
>
> There are five pairs, BG-1 to BG-5. Each has a document (`document.pdf`, and `document.txt`, which is the text the system saw and the text grounding is checked against) and the system's output (`output.json`).
>
> For each pair, follow the grading procedure in SPEC §10, starting with step 0: decide the expected result from the document alone, then grade the output against it. Fill in the attached grading sheet for every pair: the expected result, the document outcome, every field's value outcome and grounding, decoy hits you notice, and whether the case passes, citing the SPEC section for each non-obvious call.
>
> Where the spec doesn't clearly decide something, or you had to make an assumption, don't guess silently: write it under "Questions / assumptions" for that pair. Those questions are as valuable as the grades.
