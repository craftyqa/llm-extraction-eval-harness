import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ExtractOptions } from "../extract/config.ts";
import { FIELD_NAMES } from "../extract/fields.ts";
import {
  type ChatRequest,
  InfraError,
  type ModelClient,
} from "../extract/ollama.ts";
import { EXIT, resolveOptions, runCli, USAGE } from "./extract.ts";

const repo = join(import.meta.dirname, "../..");
const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const defaults: ExtractOptions = {
  model: "default-model",
  promptId: "extract.v2",
  retrieval: true,
  options: { temperature: 0.2, seed: 42, num_ctx: 8192, num_predict: 2048 },
};

const invoicePath = join(dir, "invoice.txt");
writeFileSync(invoicePath, "ACME LTD.\nInvoice No. INV-001\nTotal $10.00\n");
const blankPath = join(dir, "blank.txt");
writeFileSync(blankPath, " \n");

const notFound = { status: "not_found", reason: "absent", evidence: [] };
const validOutput = JSON.stringify({
  status: "extracted",
  reason: null,
  fields: Object.fromEntries(FIELD_NAMES.map((n) => [n, notFound])),
});

function fakeClient(...replies: (string | Error)[]) {
  const requests: ChatRequest[] = [];
  const client: ModelClient = {
    chat(request) {
      requests.push(request);
      const reply = replies.shift() ?? validOutput;
      return reply instanceof Error
        ? Promise.reject(reply)
        : Promise.resolve({
            content: reply,
            promptTokens: 10,
            completionTokens: 5,
            doneReason: "stop",
          });
    },
    modelDigest: () => Promise.resolve("sha256:fake"),
  };
  return { client, requests };
}

async function run(
  argv: string[],
  deps: { client?: ModelClient; env?: Record<string, string> } = {},
) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    defaults,
    env: deps.env ?? {},
    client: deps.client ?? fakeClient().client,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
  });
  return { code, stdout, stderr };
}

describe("resolveOptions", () => {
  it("uses the defaults with no env vars or flags", () => {
    expect(resolveOptions(defaults, {}, {})).toEqual(defaults);
  });

  it("lets env vars override defaults and flags override env vars", () => {
    const env = {
      EXTRACT_MODEL: "env-model",
      EXTRACT_PROMPT: "extract.v1",
      EXTRACT_SEED: "7",
      EXTRACT_TEMPERATURE: "0.5",
      EXTRACT_RETRIEVAL: "false",
      EXTRACT_NUM_CTX: "4096",
      EXTRACT_NUM_PREDICT: "1024",
    };
    expect(resolveOptions(defaults, env, {})).toEqual({
      model: "env-model",
      promptId: "extract.v1",
      retrieval: false,
      options: { temperature: 0.5, seed: 7, num_ctx: 4096, num_predict: 1024 },
    });
    expect(
      resolveOptions(defaults, env, {
        model: "flag-model",
        seed: "9",
        temperature: "0",
      }),
    ).toMatchObject({
      model: "flag-model",
      options: { temperature: 0, seed: 9, num_ctx: 4096 },
    });
  });

  it("ignores empty env vars", () => {
    expect(
      resolveOptions(defaults, { EXTRACT_MODEL: "", EXTRACT_SEED: "" }, {}),
    ).toEqual(defaults);
  });

  it("turns retrieval off with --no-retrieval even if the env var says true", () => {
    expect(
      resolveOptions(
        defaults,
        { EXTRACT_RETRIEVAL: "true" },
        { "no-retrieval": true },
      ).retrieval,
    ).toBe(false);
  });

  it.each([
    [{}, { seed: "abc" }, /--seed must be a number/u],
    [{}, { seed: "1.5" }, /seed/u],
    [{}, { temperature: "-1" }, /temperature/u],
    [
      { EXTRACT_RETRIEVAL: "maybe" },
      {},
      /EXTRACT_RETRIEVAL must be true or false/u,
    ],
    [{ EXTRACT_NUM_CTX: "0" }, {}, /num_ctx/u],
  ])("rejects bad values (%j, %j)", (env, flags, pattern) => {
    expect(() => resolveOptions(defaults, env, flags)).toThrow(pattern);
  });
});

describe("runCli", () => {
  it("prints the result as JSON and exits 0 when extracted", async () => {
    const { code, stdout, stderr } = await run([invoicePath]);
    expect(code).toBe(EXIT.extracted);
    expect(JSON.parse(stdout)).toMatchObject({
      status: "extracted",
      meta: { model: "default-model" },
    });
    expect(stderr).toBe("");
  });

  it("exits 2 on a reject", async () => {
    const { code, stdout } = await run([blankPath]);
    expect(code).toBe(EXIT.rejected);
    expect(JSON.parse(stdout)).toMatchObject({
      status: "rejected",
      reason: "empty",
    });
  });

  it("passes flags through to the model call", async () => {
    const fake = fakeClient();
    await run(
      [
        invoicePath,
        "--model",
        "llama3.2:3b",
        "--seed",
        "3",
        "--temperature",
        "0",
        "--prompt",
        "extract.v1",
        "--no-retrieval",
      ],
      { client: fake.client },
    );
    const [request] = fake.requests;
    expect(request?.model).toBe("llama3.2:3b");
    expect(request?.options).toMatchObject({ seed: 3, temperature: 0 });
  });

  it("prints usage and exits 0 for --help", async () => {
    const { code, stdout } = await run(["--help"]);
    expect(code).toBe(EXIT.extracted);
    expect(stdout).toBe(USAGE);
  });

  it.each([
    ["no file", []],
    ["two files", [invoicePath, blankPath]],
    ["an unknown flag", [invoicePath, "--verbose"]],
    ["a flag missing its value", [invoicePath, "--seed"]],
    ["a bad flag value", [invoicePath, "--seed", "abc"]],
    ["a missing file", [join(dir, "missing.pdf")]],
    ["an unsupported extension", [join(dir, "invoice.docx")]],
    ["an unknown prompt", [invoicePath, "--prompt", "extract.v99"]],
  ])("exits 1 with nothing on stdout for %s", async (_name, argv) => {
    const { code, stdout, stderr } = await run(argv);
    expect(code).toBe(EXIT.error);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^error: /u);
  });

  it("exits 1 and reports an infra error when Ollama is down", async () => {
    const { client } = fakeClient(
      new InfraError("Ollama request to /api/chat failed"),
    );
    const { code, stdout, stderr } = await run([invoicePath], { client });
    expect(code).toBe(EXIT.error);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^infra error: .*Is Ollama running\?/u);
  });

  it("exits 1 and reports malformed output after the retry", async () => {
    const { client } = fakeClient("nope", "still nope");
    const { code, stdout, stderr } = await run([invoicePath], { client });
    expect(code).toBe(EXIT.error);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^malformed: /u);
    expect(stderr).toContain('"retries":1');
  });
});

describe("extract CLI as a process", () => {
  it("prints only JSON on stdout and exits 2 for a reject, with MuPDF warnings on stderr", () => {
    const fake = join(dir, "fake.pdf");
    writeFileSync(fake, "not a pdf");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", join(repo, "src/cli/extract.ts"), fake],
      { cwd: repo, encoding: "utf8" },
    );
    expect(result.status).toBe(EXIT.rejected);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "rejected",
      reason: "unreadable",
    });
    expect(result.stderr).toContain("format error");
  });
});
