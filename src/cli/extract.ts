import { parseArgs } from "node:util";
import { z } from "zod";
import {
  DEFAULT_EXTRACT_OPTIONS,
  type ExtractOptions,
  extractOptionsSchema,
} from "../extract/config.ts";
import { extractFile, MalformedOutputError } from "../extract/extract.ts";
import {
  InfraError,
  type ModelClient,
  ollamaClient,
} from "../extract/ollama.ts";
import { UsageError } from "../ingest/ingest.ts";

/** Exit codes (docs/specs.md, Phase 1). */
export const EXIT = { extracted: 0, error: 1, rejected: 2 } as const;

export const USAGE = `Usage: extract <file> [options]

Extracts invoice fields from a .pdf, .csv or .txt file and prints an
ExtractionResult as JSON on stdout.

Options:
  --model <name>        Ollama model             env EXTRACT_MODEL
  --prompt <id>         prompt in prompts/       env EXTRACT_PROMPT
  --no-retrieval        send the whole document  env EXTRACT_RETRIEVAL=false
  --seed <int>          model seed               env EXTRACT_SEED
  --temperature <num>   model temperature        env EXTRACT_TEMPERATURE
  -h, --help            show this help
Also env EXTRACT_NUM_CTX, EXTRACT_NUM_PREDICT and OLLAMA_HOST.
Precedence: flags > env vars > config.default.json.

Exit codes: 0 extracted, 2 rejected, 1 error.
`;

type Flags = {
  model?: string;
  prompt?: string;
  "no-retrieval"?: boolean;
  seed?: string;
  temperature?: string;
};

/** A bad flag, env var or config value. */
class ConfigError extends Error {}

/** Config precedence: flags > env vars > defaults (`config.default.json`). */
export function resolveOptions(
  defaults: ExtractOptions,
  env: Record<string, string | undefined>,
  flags: Flags,
): ExtractOptions {
  const fromEnv = (name: string) => {
    const value = env[name];
    return value === undefined || value === "" ? undefined : value;
  };
  /** The flag if given, else the env var, else the default. */
  const pick = <T>(
    flag: [name: string, value: string | undefined] | undefined,
    envName: string,
    parse: (value: string, source: string) => T,
    fallback: T,
  ): T => {
    if (flag?.[1] !== undefined) return parse(flag[1], `--${flag[0]}`);
    const value = fromEnv(envName);
    return value === undefined ? fallback : parse(value, envName);
  };

  const options: ExtractOptions = {
    model: pick(
      ["model", flags.model],
      "EXTRACT_MODEL",
      asString,
      defaults.model,
    ),
    promptId: pick(
      ["prompt", flags.prompt],
      "EXTRACT_PROMPT",
      asString,
      defaults.promptId,
    ),
    retrieval:
      flags["no-retrieval"] === true
        ? false
        : pick(undefined, "EXTRACT_RETRIEVAL", asBoolean, defaults.retrieval),
    options: {
      temperature: pick(
        ["temperature", flags.temperature],
        "EXTRACT_TEMPERATURE",
        asNumber,
        defaults.options.temperature,
      ),
      seed: pick(
        ["seed", flags.seed],
        "EXTRACT_SEED",
        asNumber,
        defaults.options.seed,
      ),
      num_ctx: pick(
        undefined,
        "EXTRACT_NUM_CTX",
        asNumber,
        defaults.options.num_ctx,
      ),
      num_predict: pick(
        undefined,
        "EXTRACT_NUM_PREDICT",
        asNumber,
        defaults.options.num_predict,
      ),
    },
  };

  const result = extractOptionsSchema.safeParse(options);
  if (!result.success) {
    throw new ConfigError(`Invalid options:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function asString(value: string): string {
  return value;
}

function asNumber(value: string, source: string): number {
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) {
    throw new ConfigError(`${source} must be a number (got "${value}")`);
  }
  return n;
}

function asBoolean(value: string, source: string): boolean {
  const lower = value.toLowerCase();
  if (["true", "1", "yes"].includes(lower)) return true;
  if (["false", "0", "no"].includes(lower)) return false;
  throw new ConfigError(`${source} must be true or false (got "${value}")`);
}

export type CliDeps = {
  client?: ModelClient;
  env?: Record<string, string | undefined>;
  defaults?: ExtractOptions;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

/** Runs the CLI and returns its exit code. Only the result JSON goes to stdout. */
export async function runCli(
  argv: string[],
  deps: CliDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));

  let flags: Flags & { help?: boolean };
  let positionals: string[];
  try {
    ({ values: flags, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        model: { type: "string" },
        prompt: { type: "string" },
        "no-retrieval": { type: "boolean" },
        seed: { type: "string" },
        temperature: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    stderr(`error: ${message(error)}\n\n${USAGE}`);
    return EXIT.error;
  }
  if (flags.help === true) {
    stdout(USAGE);
    return EXIT.extracted;
  }
  const [path, ...extra] = positionals;
  if (path === undefined || extra.length > 0) {
    stderr(`error: expected exactly one file\n\n${USAGE}`);
    return EXIT.error;
  }

  try {
    const options = resolveOptions(
      deps.defaults ?? DEFAULT_EXTRACT_OPTIONS,
      deps.env ?? process.env,
      flags,
    );
    const result = await extractFile(
      path,
      deps.client ?? ollamaClient(),
      options,
    );
    stdout(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === "extracted" ? EXIT.extracted : EXIT.rejected;
  } catch (error) {
    stderr(describeError(error));
    return EXIT.error;
  }
}

function describeError(error: unknown): string {
  if (error instanceof UsageError || error instanceof ConfigError) {
    return `error: ${error.message}\n`;
  }
  if (error instanceof InfraError) {
    const cause = error.cause === undefined ? "" : ` (${message(error.cause)})`;
    return `infra error: ${error.message}${cause}. Is Ollama running?\n`;
  }
  if (error instanceof MalformedOutputError) {
    return [
      `malformed: ${error.message}`,
      `last output: ${error.lastOutput}`,
      `meta: ${JSON.stringify(error.meta)}`,
      "",
    ].join("\n");
  }
  return `error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
