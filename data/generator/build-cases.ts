import { join } from "node:path";
import { parseArgs } from "node:util";
import { CASES } from "./cases.ts";
import { generateCase, writeCase } from "./generate.ts";

export const CASES_DIR = join(import.meta.dirname, "..", "cases");

const USAGE = `Usage: generate:cases [--only <id>] [--force]

Writes every case in data/generator/cases.ts to data/cases/<id>/.
Existing cases are skipped unless --force; reviewed cases should only be
regenerated on purpose, through a reviewed PR.
`;

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      only: { type: "string" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  if (values.help === true) {
    process.stdout.write(USAGE);
    return 0;
  }
  const selected = CASES.filter(
    (c) => values.only === undefined || c.info.id === values.only,
  );
  if (selected.length === 0) {
    process.stderr.write(`error: no case ${values.only ?? ""} in cases.ts\n`);
    return 1;
  }
  for (const spec of selected) {
    const dir = join(CASES_DIR, spec.info.id);
    try {
      writeCase(
        dir,
        await generateCase(spec.seed, spec.options, spec.info),
        values.force === true,
      );
      process.stderr.write(`wrote ${spec.info.id}\n`);
    } catch (error) {
      process.stderr.write(
        `skipped ${spec.info.id}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
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
