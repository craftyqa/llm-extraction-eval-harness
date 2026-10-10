import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { IngestedSource } from "../ingest/types.ts";
import {
  DEFAULT_EXTRACT_OPTIONS,
  type ExtractOptions,
  extractFile,
  extractSource,
  MalformedOutputError,
} from "./extract.ts";
import { FIELD_NAMES, type FieldName } from "./fields.ts";
import { type ChatRequest, InfraError, type ModelClient } from "./ollama.ts";
import { loadPrompt } from "./prompt.ts";

const examples = join(import.meta.dirname, "../../spec/examples");
const dir = mkdtempSync(join(tmpdir(), "extract-test-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

type Reply = string | { content: string; promptTokens: number } | Error;

/** A model client that replays canned responses and records requests. */
function fakeClient(...replies: Reply[]) {
  const requests: ChatRequest[] = [];
  let digestCalls = 0;
  const client: ModelClient = {
    chat(request) {
      requests.push(structuredClone(request));
      const reply = replies.shift();
      if (reply === undefined) throw new Error("fake client: no reply left");
      if (reply instanceof Error) return Promise.reject(reply);
      const { content, promptTokens } =
        typeof reply === "string"
          ? { content: reply, promptTokens: 500 }
          : reply;
      return Promise.resolve({
        content,
        promptTokens,
        completionTokens: 200,
        doneReason: "stop",
      });
    },
    modelDigest() {
      digestCalls++;
      return Promise.resolve("sha256:fake");
    },
  };
  return { client, requests, digestCalls: () => digestCalls };
}

type ModelFieldJson = {
  status: "found" | "not_found";
  reason: string | null;
  evidence: { raw: string; quote: string }[];
};

const absent: ModelFieldJson = {
  status: "not_found",
  reason: "absent",
  evidence: [],
};
const found = (
  ...evidence: [raw: string, quote: string][]
): ModelFieldJson => ({
  status: "found",
  reason: null,
  evidence: evidence.map(([raw, quote]) => ({ raw, quote })),
});

function modelOutput(
  fields: Partial<Record<FieldName, ModelFieldJson>>,
): string {
  return JSON.stringify({
    status: "extracted",
    reason: null,
    fields: Object.fromEntries(
      FIELD_NAMES.map((name) => [name, fields[name] ?? absent]),
    ),
  });
}

function textSource(text: string): IngestedSource {
  return { text, sourceType: "txt", bytes: text.length, unmappedGlyphs: 0 };
}

const invoice = [
  "NORTHWIND SUPPLY LTD.",
  "Invoice No. INV-001",
  "Invoice Date: 2026-04-02",
  "Bill To: Saltmarsh Provisions Inc.",
  "Subtotal 1,000.00",
  "GST 50.00",
  "PST 70.00",
  "Total CAD $1,120.00",
  "",
].join("\n");

describe("extractSource", () => {
  it("normalises, grounds and records the run", async () => {
    const fake = fakeClient(
      modelOutput({
        invoiceNumber: found(["INV-001", "Invoice No. INV-001"]),
        invoiceDate: found(["2026-04-02", "Invoice Date: 2026-04-02"]),
        vendorName: found(["NORTHWIND SUPPLY LTD.", "NORTHWIND SUPPLY LTD."]),
        currency: found(["CAD", "Total CAD $1,120.00"]),
        subtotal: found(["1,000.00", "Subtotal 1,000.00"]),
        taxAmount: found(["50.00", "GST 50.00"], ["70.00", "PST 70.00"]),
        total: found(["$1,120.00", "Total CAD $1,120.00"]),
      }),
    );

    const result = await extractSource(textSource(invoice), fake.client);

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    expect(result.fields.invoiceNumber).toEqual({
      status: "found",
      value: "INV-001",
      evidence: [
        {
          raw: "INV-001",
          quote: "Invoice No. INV-001",
          start: 22,
          end: 41,
          grounded: true,
        },
      ],
    });
    expect(result.fields.subtotal).toMatchObject({
      status: "found",
      value: "1000.00",
    });
    expect(result.fields.taxAmount).toMatchObject({
      status: "found",
      value: "120.00",
    });
    expect(result.fields.total).toMatchObject({
      status: "found",
      value: "1120.00",
    });
    expect(result.fields.currency).toMatchObject({
      status: "found",
      value: "CAD",
    });
    expect(result.fields.dueDate).toEqual({
      status: "not_found",
      reason: "absent",
    });

    const prompt = loadPrompt("extract.v1");
    expect(result.meta).toMatchObject({
      model: "qwen2.5:7b-instruct",
      modelDigest: "sha256:fake",
      promptId: "extract.v1",
      promptHash: prompt.hash,
      options: DEFAULT_EXTRACT_OPTIONS.options,
      retrieval: true,
      retries: 0,
      promptTokens: 500,
      completionTokens: 200,
      source: { sourceType: "txt", bytes: invoice.length, unmappedGlyphs: 0 },
    });
    expect(result.meta.appVersion).toMatch(/^0\.0\.0\+/u);

    const [request] = fake.requests;
    expect(request?.messages[0]).toEqual({
      role: "system",
      content: prompt.text,
    });
    expect(request?.messages[1]?.content).toBe(`Document:\n\n${invoice}`);
    expect(request?.options).toEqual(DEFAULT_EXTRACT_OPTIONS.options);
  });

  it("keeps an ungrounded field found, with grounded false (SPEC §5)", async () => {
    const fake = fakeClient(
      modelOutput({ total: found(["$1,120.00", "Grand Total $1,120.00"]) }),
    );
    const result = await extractSource(textSource(invoice), fake.client);
    expect(result.status === "extracted" && result.fields.total).toEqual({
      status: "found",
      value: "1120.00",
      evidence: [
        {
          raw: "$1,120.00",
          quote: "Grand Total $1,120.00",
          start: null,
          end: null,
          grounded: false,
        },
      ],
    });
  });

  it.each([
    ["an unparseable raw", found(["$1.5", "Total $1.5"]), "unparseable"],
    [
      "raws that disagree",
      found(["1,120.00", "Total 1,120.00"], ["1,210.00", "Total 1,210.00"]),
      "conflicting",
    ],
  ] as const)("turns %s into not_found", async (_name, field, reason) => {
    const fake = fakeClient(modelOutput({ total: field }));
    const result = await extractSource(textSource(invoice), fake.client);
    expect(result.status === "extracted" && result.fields.total).toEqual({
      status: "not_found",
      reason,
    });
  });

  it("accepts raws that agree after normalisation", async () => {
    const fake = fakeClient(
      modelOutput({
        dueDate: found(
          ["2026-05-02", "Due 2026-05-02"],
          ["May 2, 2026", "due May 2, 2026"],
        ),
      }),
    );
    const result = await extractSource(textSource(invoice), fake.client);
    expect(
      result.status === "extracted" && result.fields.dueDate,
    ).toMatchObject({
      status: "found",
      value: "2026-05-02",
    });
  });

  it("returns the model's reject", async () => {
    const fake = fakeClient(
      JSON.stringify({
        status: "rejected",
        reason: "out_of_scope",
        fields: Object.fromEntries(FIELD_NAMES.map((n) => [n, absent])),
      }),
    );
    const result = await extractSource(textSource(invoice), fake.client);
    expect(result).toMatchObject({
      status: "rejected",
      reason: "out_of_scope",
    });
  });

  describe("retry policy", () => {
    it("retries once with the validation error appended", async () => {
      const fake = fakeClient("{ truncated", modelOutput({}));
      const result = await extractSource(textSource(invoice), fake.client);

      expect(result.status).toBe("extracted");
      expect(result.meta).toMatchObject({
        retries: 1,
        promptTokens: 1000,
        completionTokens: 400,
      });
      const retry = fake.requests[1]?.messages ?? [];
      expect(retry).toHaveLength(4);
      expect(retry[2]).toEqual({ role: "assistant", content: "{ truncated" });
      expect(retry[3]?.content).toMatch(
        /^Your previous output was invalid:\nOutput is not valid JSON/u,
      );
    });

    it("retries an empty raw (decision #35)", async () => {
      const fake = fakeClient(
        modelOutput({ total: found(["", "Total"]) }),
        modelOutput({}),
      );
      const result = await extractSource(textSource(invoice), fake.client);
      expect(result.meta.retries).toBe(1);
      expect(fake.requests[1]?.messages[3]?.content).toContain(
        "fields.total.evidence",
      );
    });

    it("throws MalformedOutputError after a failed retry", async () => {
      const fake = fakeClient("nope", "still nope");
      const error: unknown = await extractSource(
        textSource(invoice),
        fake.client,
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MalformedOutputError);
      expect(error).toMatchObject({
        lastOutput: "still nope",
        meta: { retries: 1 },
      });
      expect(fake.requests).toHaveLength(2);
    });
  });

  describe("too_large (SPEC §7)", () => {
    const tight: ExtractOptions = {
      ...DEFAULT_EXTRACT_OPTIONS,
      options: {
        ...DEFAULT_EXTRACT_OPTIONS.options,
        num_ctx: 4096,
        num_predict: 1024,
      },
    };

    it("rejects before any model call when the estimate doesn't fit", async () => {
      const fake = fakeClient();
      const result = await extractSource(
        textSource("x".repeat(20_000)),
        fake.client,
        tight,
      );
      expect(result).toMatchObject({
        status: "rejected",
        reason: "too_large",
        meta: { modelDigest: null, promptTokens: 0 },
      });
      expect(fake.requests).toHaveLength(0);
      expect(fake.digestCalls()).toBe(0);
    });

    it("rejects when the measured prompt doesn't fit", async () => {
      const fake = fakeClient({ content: modelOutput({}), promptTokens: 3500 });
      const result = await extractSource(
        textSource(invoice),
        fake.client,
        tight,
      );
      expect(result).toMatchObject({
        status: "rejected",
        reason: "too_large",
        meta: { modelDigest: "sha256:fake", promptTokens: 3500 },
      });
    });
  });

  it("lets an infrastructure error through", async () => {
    const fake = fakeClient(new InfraError("Ollama is down"));
    await expect(
      extractSource(textSource(invoice), fake.client),
    ).rejects.toBeInstanceOf(InfraError);
  });

  describe("retrieval", () => {
    const filler = Array.from(
      { length: 60 },
      (_, i) => `lorem ipsum dolor ${String(i)}`,
    ).join("\n");
    const long = `NORTHWIND SUPPLY LTD.\nInvoice No. INV-001\n\n${filler}\n\n${filler}\n\nTotal 10.00\n`;

    it("sends only retrieved passages, separated by a marker", async () => {
      const fake = fakeClient(modelOutput({}));
      await extractSource(textSource(long), fake.client);
      const user = fake.requests[0]?.messages[1]?.content ?? "";
      expect(user).toContain("Invoice No. INV-001");
      expect(user).toContain("Total 10.00");
      expect(user).toContain("\n\n[…]\n\n");
      expect(user.length).toBeLessThan(long.length);
    });

    it("sends the whole document with retrieval off", async () => {
      const fake = fakeClient(modelOutput({}));
      const result = await extractSource(textSource(long), fake.client, {
        ...DEFAULT_EXTRACT_OPTIONS,
        retrieval: false,
      });
      expect(fake.requests[0]?.messages[1]?.content).toBe(
        `Document:\n\n${long}`,
      );
      expect(result.meta.retrieval).toBe(false);
    });
  });
});

describe("extractFile", () => {
  it("returns an ingest reject without calling the model", async () => {
    const path = join(dir, "blank.txt");
    writeFileSync(path, " \n");
    const fake = fakeClient();
    const result = await extractFile(path, fake.client);
    expect(result).toMatchObject({
      status: "rejected",
      reason: "empty",
      meta: { modelDigest: null },
    });
    expect(result.meta).not.toHaveProperty("source");
    expect(fake.digestCalls()).toBe(0);
  });

  type Expected = {
    status: "extracted" | "rejected";
    reason?: string;
    fields?: Record<
      string,
      {
        status: "found" | "not_found";
        value?: string;
        reason?: string;
        evidence?: { raw: string; quote: string }[];
      }
    >;
  };

  /** What a perfect model would return for an example, from its expected.json. */
  function perfectOutput(expected: Expected): string {
    if (expected.status === "rejected") {
      return JSON.stringify({
        status: "rejected",
        reason: expected.reason,
        fields: Object.fromEntries(FIELD_NAMES.map((n) => [n, absent])),
      });
    }
    return modelOutput(
      Object.fromEntries(
        FIELD_NAMES.map((name) => {
          const field = expected.fields?.[name];
          if (field?.status !== "found")
            return [name, { ...absent, reason: field?.reason ?? "absent" }];
          return [
            name,
            found(
              ...(field.evidence ?? []).map(
                (e) => [e.raw, e.quote] as [string, string],
              ),
            ),
          ];
        }),
      ),
    );
  }

  it.each([
    "01-classic",
    "02-service",
    "03-wholesale",
    "04-eu",
    "05-statement",
    "06-ambiguous-date",
    "07-account-statement",
  ])(
    "%s: a perfect model's output gives the expected result",
    async (caseDir) => {
      const expected = JSON.parse(
        readFileSync(join(examples, caseDir, "expected.json"), "utf8"),
      ) as Expected;
      const fake = fakeClient(perfectOutput(expected));
      const result = await extractFile(
        join(examples, caseDir, "source.pdf"),
        fake.client,
      );

      expect(result.status).toBe(expected.status);
      if (result.status === "rejected") {
        expect(result.reason).toBe(expected.reason);
        return;
      }
      for (const name of FIELD_NAMES) {
        const want = expected.fields?.[name];
        const got = result.fields[name];
        expect(got.status, name).toBe(want?.status);
        if (got.status === "found") {
          // Names are stored as printed; the token-set matcher compares them (SPEC §8)
          if (name !== "vendorName" && name !== "customerName") {
            expect(got.value, name).toBe(want?.value);
          }
          expect(
            got.evidence.every((e) => e.grounded),
            name,
          ).toBe(true);
        }
      }
    },
  );

  it("06-ambiguous-date: a copied 03/04/2026 becomes not_found / ambiguous", async () => {
    const fake = fakeClient(
      modelOutput({ invoiceDate: found(["03/04/2026", "03/04/2026"]) }),
    );
    const result = await extractFile(
      join(examples, "06-ambiguous-date", "source.pdf"),
      fake.client,
    );
    expect(result.status === "extracted" && result.fields.invoiceDate).toEqual({
      status: "not_found",
      reason: "ambiguous",
    });
  });
});
