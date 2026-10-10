import { describe, expect, it } from "vitest";
import { FIELD_NAMES } from "./fields.ts";
import { modelOutputJsonSchema, parseModelOutput } from "./schema.ts";

const notFound = { status: "not_found", reason: "absent", evidence: [] };

function output(
  overrides: Record<string, unknown> = {},
  fields: Record<string, unknown> = {},
) {
  return {
    status: "extracted",
    reason: null,
    fields: {
      ...Object.fromEntries(FIELD_NAMES.map((name) => [name, notFound])),
      ...fields,
    },
    ...overrides,
  };
}

const parse = (value: unknown) => parseModelOutput(JSON.stringify(value));

describe("parseModelOutput", () => {
  it("accepts a valid extraction", () => {
    const result = parse(
      output(
        {},
        {
          total: {
            status: "found",
            reason: null,
            evidence: [{ raw: "54.60", quote: "Total 54.60" }],
          },
        },
      ),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a reject with a reason", () => {
    expect(
      parse(output({ status: "rejected", reason: "out_of_scope" })).ok,
    ).toBe(true);
  });

  it("reports invalid JSON", () => {
    expect(parseModelOutput("{ not json")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^Output is not valid JSON/u) as string,
    });
  });

  it.each([
    [
      "a missing field",
      (o: ReturnType<typeof output>) => {
        const fields: Record<string, unknown> = { ...o.fields };
        delete fields["total"];
        return { ...o, fields };
      },
    ],
    [
      "a reject without a reason",
      (o: ReturnType<typeof output>) => ({ ...o, status: "rejected" }),
    ],
    [
      "a reason on an extraction",
      (o: ReturnType<typeof output>) => ({ ...o, reason: "out_of_scope" }),
    ],
    [
      "an ingest-only reject reason",
      (o: ReturnType<typeof output>) => ({
        ...o,
        status: "rejected",
        reason: "empty",
      }),
    ],
  ])("rejects %s", (_name, mutate) => {
    expect(parse(mutate(output())).ok).toBe(false);
  });

  it.each([
    ["found with no evidence", { status: "found", reason: null, evidence: [] }],
    [
      "not_found with evidence",
      {
        status: "not_found",
        reason: "absent",
        evidence: [{ raw: "1", quote: "1" }],
      },
    ],
    [
      "an empty raw (decision #35)",
      {
        status: "found",
        reason: null,
        evidence: [{ raw: "", quote: "Total" }],
      },
    ],
    [
      "a blank quote (decision #35)",
      { status: "found", reason: null, evidence: [{ raw: "1", quote: "  " }] },
    ],
    [
      "the app-only reason unparseable",
      { status: "not_found", reason: "unparseable", evidence: [] },
    ],
  ])("rejects a field that is %s", (_name, field) => {
    const result = parse(output({}, { total: field }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("total");
  });
});

describe("modelOutputJsonSchema", () => {
  it("requires every field and enforces non-empty evidence strings", () => {
    const schema = modelOutputJsonSchema as unknown as {
      required: string[];
      properties: {
        fields: {
          required: string[];
          properties: Record<
            string,
            { properties: { evidence: { items: unknown } } }
          >;
        };
      };
    };
    expect(schema.required).toEqual(["status", "reason", "fields"]);
    expect(schema.properties.fields.required).toEqual([...FIELD_NAMES]);
    expect(
      schema.properties.fields.properties["total"]?.properties.evidence.items,
    ).toMatchObject({
      required: ["raw", "quote"],
      properties: { raw: { minLength: 1 }, quote: { minLength: 1 } },
    });
  });
});
