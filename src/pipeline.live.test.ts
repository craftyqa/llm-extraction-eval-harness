// Live integration tests (`npm run test:live`): the real pipeline against a
// running Ollama. They check plumbing, not extraction quality, so they accept
// either an extraction or a reject wherever the model's judgement decides.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXIT } from "./cli/extract.ts";
import {
  DEFAULT_EXTRACT_OPTIONS,
  type ExtractOptions,
} from "./extract/config.ts";
import { extractFile } from "./extract/extract.ts";
import { FIELD_NAMES } from "./extract/fields.ts";
import { InfraError, ollamaClient } from "./extract/ollama.ts";
import { loadPrompt, renderDocument } from "./extract/prompt.ts";
import { modelOutputJsonSchema } from "./extract/schema.ts";
import { estimateTokens } from "./extract/tokens.ts";

const repo = join(import.meta.dirname, "..");
const model = process.env["LIVE_MODEL"] ?? "llama3.2:3b";
const options: ExtractOptions = { ...DEFAULT_EXTRACT_OPTIONS, model };
const client = ollamaClient();

const dir = mkdtempSync(join(tmpdir(), "live-test-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A small, complete, synthetic Canadian invoice. */
const invoicePath = join(dir, "invoice.txt");
writeFileSync(
  invoicePath,
  [
    "CEDARPOINT MARINE SUPPLY LTD.",
    "41 Wharf Street, Lunenburg, NS B0J 2C0",
    "GST/HST No. 81234 5678 RT0001",
    "",
    "INVOICE",
    "Invoice No.: CMS-2026-0311",
    "Invoice Date: 2026-03-11",
    "Due Date: 2026-04-10",
    "",
    "Bill To: Saltspray Charters Inc., 9 Harbour Road, Chester, NS B0J 1J0",
    "",
    "Marine rope, 50 m      2 x 120.00     240.00",
    "Subtotal                               240.00",
    "HST 15%                                 36.00",
    "Total (CAD)                            276.00",
    "",
  ].join("\n"),
);

beforeAll(async () => {
  try {
    await client.modelDigest(model);
  } catch (error) {
    throw new Error(
      `Live tests need Ollama running with ${model} pulled ` +
        `(ollama pull ${model}; set LIVE_MODEL to use another model): ` +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
});

function runCli(args: string[], env: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", join(repo, "src/cli/extract.ts"), ...args],
    { cwd: repo, encoding: "utf8", env: { ...process.env, ...env } },
  );
}

describe("Ollama format", () => {
  it("enforces the schema, including non-empty raw and quote (decision #35)", async () => {
    // Ask for exactly what the schema forbids: the constraint has to win
    const response = await client.chat({
      model,
      messages: [
        {
          role: "system",
          content:
            'Return JSON. Set status to "extracted" and reason to null. Mark every field as "found" with reason null and one evidence item whose "raw" and "quote" are both the empty string "".',
        },
        { role: "user", content: renderDocument(["Invoice INV-1"]) },
      ],
      format: modelOutputJsonSchema,
      options: { ...options.options, num_predict: 1024 },
    });

    const output = JSON.parse(response.content) as {
      fields: Record<string, { evidence: { raw: string; quote: string }[] }>;
    };
    expect(Object.keys(output.fields).sort()).toEqual([...FIELD_NAMES].sort());
    for (const field of Object.values(output.fields)) {
      for (const { raw, quote } of field.evidence) {
        expect(raw.length).toBeGreaterThan(0);
        expect(quote.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("extractFile", () => {
  it("records the model digest, seed and options in RunMeta", async () => {
    const result = await extractFile(invoicePath, client, options);
    expect(result.meta).toMatchObject({
      model,
      modelDigest: await client.modelDigest(model),
      promptId: options.promptId,
      options: options.options,
    });
    expect(result.meta.modelDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.meta.promptTokens).toBeGreaterThan(0);
    expect(result.meta.latencyMs).toBeGreaterThan(0);
  });

  // Ollama silently truncates a prompt over num_ctx and reports the truncated
  // count, so truncation can only be caught before the call (decision #52)
  const dense = `Invoice No. X-1\n${Array.from({ length: 3000 }, (_, i) =>
    String.fromCharCode(0x4e00 + ((i * 7919) % 20000)),
  ).join("")}\n`;

  it.each([
    ["the small invoice", () => readFileSync(invoicePath, "utf8")],
    ["digit-heavy text", () => "4021 7730 1189 0042 5561\n".repeat(200)],
    ["dense CJK text", () => dense],
  ])(
    "never estimates fewer tokens than Ollama counts for %s",
    async (_name, makeText) => {
      const prompt = loadPrompt(options.promptId);
      const messages = [
        { role: "system" as const, content: prompt.text },
        { role: "user" as const, content: renderDocument([makeText()]) },
      ];
      const response = await client.chat({
        model,
        messages,
        format: undefined,
        // Large enough that nothing is truncated, so the count is the real one
        options: { ...options.options, num_ctx: 16384, num_predict: 1 },
      });
      const estimate = messages.reduce(
        (sum, m) => sum + estimateTokens(m.content),
        0,
      );
      expect(estimate).toBeGreaterThanOrEqual(response.promptTokens);
    },
  );

  it("rejects a document Ollama would truncate as too_large, before any model call", async () => {
    const path = join(dir, "dense.txt");
    writeFileSync(path, dense);
    const result = await extractFile(path, client, options);
    expect(result).toMatchObject({
      status: "rejected",
      reason: "too_large",
      meta: { modelDigest: null, promptTokens: 0 },
    });
  });

  it("reports Ollama being down as an infra error, not a model failure", async () => {
    const down = ollamaClient({ host: "http://127.0.0.1:9", timeoutMs: 5000 });
    await expect(
      extractFile(invoicePath, down, options),
    ).rejects.toBeInstanceOf(InfraError);
  });
});

describe("extract CLI", () => {
  it("prints only JSON on stdout and exits 0 or 2 to match the result", () => {
    const run = runCli([invoicePath, "--model", model]);
    const result = JSON.parse(run.stdout) as { status: string };
    expect(run.status).toBe(
      result.status === "extracted" ? EXIT.extracted : EXIT.rejected,
    );
  });

  it("applies config precedence: flag > env var > config.default.json", () => {
    const run = runCli([invoicePath, "--seed", "9"], {
      EXTRACT_MODEL: model,
      EXTRACT_SEED: "7",
      EXTRACT_TEMPERATURE: "0",
    });
    const result = JSON.parse(run.stdout) as {
      meta: {
        model: string;
        options: { seed: number; temperature: number; num_ctx: number };
      };
    };
    expect(result.meta.model).toBe(model);
    expect(result.meta.options).toMatchObject({
      seed: 9,
      temperature: 0,
      num_ctx: DEFAULT_EXTRACT_OPTIONS.options.num_ctx,
    });
  });

  it("exits 1 with an infra error and nothing on stdout when Ollama is down", () => {
    const run = runCli([invoicePath, "--model", model], {
      OLLAMA_HOST: "127.0.0.1:9",
    });
    expect(run.status).toBe(EXIT.error);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/^infra error: /u);
  });
});
