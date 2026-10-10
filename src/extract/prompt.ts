import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../ingest/ingest.ts";
import { normaliseText } from "../ingest/text.ts";

const promptsDir = join(import.meta.dirname, "../../prompts");

export type Prompt = {
  /** File name without `.md`, e.g. `extract.v1`. */
  id: string;
  text: string;
  /** SHA-256 of `text`, hex. */
  hash: string;
};

/**
 * Loads a versioned prompt from `prompts/`. Line endings are normalised before
 * hashing, so a Windows checkout and a Linux one give the same hash.
 */
export function loadPrompt(id: string): Prompt {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(id)) {
    throw new UsageError(`Invalid prompt id: ${id}`, "prompt_not_found");
  }
  let content: string;
  try {
    content = readFileSync(join(promptsDir, `${id}.md`), "utf8");
  } catch {
    throw new UsageError(
      `Prompt not found: prompts/${id}.md`,
      "prompt_not_found",
    );
  }
  const text = normaliseText(content);
  return { id, text, hash: createHash("sha256").update(text).digest("hex") };
}

/** Between retrieved passages; not document text, so a quote spanning it won't ground. */
export const PASSAGE_SEPARATOR = "\n\n[…]\n\n";

/** The user message: the document text, or the retrieved passages in document order. */
export function renderDocument(passages: readonly string[]): string {
  return `Document:\n\n${passages.join(PASSAGE_SEPARATOR)}`;
}
