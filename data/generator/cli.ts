import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  type CaseInfo,
  generateCase,
  generatorOptionsSchema,
} from "./generate.ts";

export const USAGE = `Usage: generate --seed <int> --out <dir> [options]

Writes one generated case: input.<pdf|csv|txt>, expected.json and meta.json.
The same seed and options always give byte-identical files.

Options:
  --seed <int>          generator seed (required)
  --out <dir>           case directory to write (required)
  --id <id>             case id                    default GEN-<seed>
  --format <fmt>        pdf, txt or csv            default drawn from the seed
  --layout <name>       classic, erp, bilingual (pdf); plain, email (txt);
                        lines, summary (csv)       default drawn from the seed
  --options <json>      any other generator options, e.g. '{"deposit":true}'
  --partition <name>    meta.json partition        default clean
  --difficulty <level>  easy, medium or hard       default easy
  --risks <ids>         comma-separated, e.g. R-1,R-6
  --smoke               mark the case smoke: true
  --notes <text>        meta.json notes            default a summary of the draw
  --force               overwrite an existing case directory
  -h, --help            show this help
`;

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: "string" },
      out: { type: "string" },
      id: { type: "string" },
      format: { type: "string" },
      layout: { type: "string" },
      options: { type: "string" },
      partition: { type: "string" },
      difficulty: { type: "string" },
      risks: { type: "string" },
      smoke: { type: "boolean" },
      notes: { type: "string" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  if (values.help === true) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (
    values.seed === undefined ||
    !/^\d+$/u.test(values.seed) ||
    values.out === undefined
  ) {
    process.stderr.write(
      `error: --seed <int> and --out <dir> are required\n\n${USAGE}`,
    );
    return 1;
  }
  const seed = Number(values.seed);
  const out = values.out;
  if (existsSync(join(out, "expected.json")) && values.force !== true) {
    process.stderr.write(
      `error: ${out} already has a case; pass --force to overwrite it\n`,
    );
    return 1;
  }

  const options = generatorOptionsSchema.parse({
    ...(values.options === undefined
      ? {}
      : (JSON.parse(values.options) as object)),
    ...(values.format === undefined ? {} : { format: values.format }),
    ...(values.layout === undefined ? {} : { layout: values.layout }),
  });
  const difficulty = values.difficulty ?? "easy";
  if (
    difficulty !== "easy" &&
    difficulty !== "medium" &&
    difficulty !== "hard"
  ) {
    process.stderr.write(`error: --difficulty must be easy, medium or hard\n`);
    return 1;
  }
  const info: CaseInfo = {
    id: values.id ?? `GEN-${String(seed)}`,
    partition: values.partition ?? "clean",
    difficulty,
    risks:
      values.risks === undefined
        ? []
        : values.risks.split(",").map((r) => r.trim()),
    smoke: values.smoke === true,
    ...(values.notes === undefined ? {} : { notes: values.notes }),
  };

  const generated = await generateCase(seed, options, info);
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  mkdirSync(out, { recursive: true });
  // A regenerated case may change format; don't leave the old input behind
  for (const extension of ["pdf", "txt", "csv"]) {
    rmSync(join(out, `input.${extension}`), { force: true });
  }
  writeFileSync(
    join(out, `input.${generated.input.extension}`),
    generated.input.data,
  );
  writeFileSync(join(out, "expected.json"), json(generated.expected));
  writeFileSync(join(out, "meta.json"), json(generated.meta));
  process.stderr.write(`wrote ${out} (${generated.meta.notes})\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
