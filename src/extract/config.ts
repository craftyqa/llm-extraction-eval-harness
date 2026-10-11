import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const extractOptionsSchema = z
  .object({
    model: z.string().min(1),
    promptId: z.string().min(1),
    /** `false` sends the whole document (`--no-retrieval`). */
    retrieval: z.boolean(),
    options: z
      .object({
        temperature: z.number().min(0),
        seed: z.int(),
        num_ctx: z.int().positive(),
        num_predict: z.int().positive(),
      })
      .strict(),
  })
  .strict();

export type ExtractOptions = z.infer<typeof extractOptionsSchema>;

export const DEFAULT_CONFIG_PATH = join(
  import.meta.dirname,
  "../../config.default.json",
);

/** Reads and validates a config file. Throws with the file name and the problem. */
export function loadConfig(path: string = DEFAULT_CONFIG_PATH): ExtractOptions {
  const json: unknown = JSON.parse(readFileSync(path, "utf8"));
  const result = extractOptionsSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Invalid config ${path}:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/** `config.default.json`: the lowest layer of config precedence (docs/specs.md, Phase 1). */
export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = loadConfig();
