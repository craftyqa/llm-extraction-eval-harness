import { describe, expect, it, vi } from "vitest";
import { InfraError, ollamaClient } from "./ollama.ts";

const options = {
  temperature: 0.2,
  seed: 42,
  num_ctx: 8192,
  num_predict: 2048,
};

function fakeFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fn.mockRejectedValueOnce(response);
    else fn.mockResolvedValueOnce(response);
  }
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("ollamaClient.chat", () => {
  it("posts a non-streaming chat with the schema, options and thinking off", async () => {
    const fetch = fakeFetch(
      json({
        message: { role: "assistant", content: "{}" },
        prompt_eval_count: 812,
        eval_count: 240,
        done_reason: "stop",
      }),
    );
    const client = ollamaClient({ host: "http://ollama.test:11434", fetch });

    const response = await client.chat({
      model: "qwen2.5:7b-instruct",
      messages: [{ role: "user", content: "hi" }],
      format: { type: "object" },
      options,
    });

    expect(response).toEqual({
      content: "{}",
      promptTokens: 812,
      completionTokens: 240,
      doneReason: "stop",
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toEqual(new URL("http://ollama.test:11434/api/chat"));
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      model: "qwen2.5:7b-instruct",
      messages: [{ role: "user", content: "hi" }],
      format: { type: "object" },
      options,
      stream: false,
      think: false,
    });
  });

  it("adds a scheme to a bare host, as OLLAMA_HOST allows", async () => {
    const fetch = fakeFetch(json({ message: { content: "{}" } }));
    await ollamaClient({ host: "127.0.0.1:11434", fetch }).chat({
      model: "m",
      messages: [],
      format: {},
      options,
    });
    expect(fetch.mock.calls[0]?.[0]).toEqual(
      new URL("http://127.0.0.1:11434/api/chat"),
    );
  });

  it.each([
    ["the connection fails", () => fakeFetch(new TypeError("fetch failed"))],
    [
      "Ollama returns an error status",
      () => fakeFetch(json({ error: "model not found" }, 404)),
    ],
    [
      "the body isn't JSON",
      () => fakeFetch(new Response("<html>", { status: 200 })),
    ],
    ["there's no message content", () => fakeFetch(json({ done: true }))],
  ])("throws InfraError when %s", async (_name, makeFetch) => {
    const client = ollamaClient({
      host: "http://ollama.test",
      fetch: makeFetch(),
    });
    await expect(
      client.chat({ model: "m", messages: [], format: {}, options }),
    ).rejects.toBeInstanceOf(InfraError);
  });
});

describe("ollamaClient.modelDigest", () => {
  const tags = {
    models: [
      { name: "llama3.2:3b", digest: "a80c4f17" },
      { name: "qwen2.5:7b-instruct", digest: "845dbda0" },
    ],
  };

  it("returns the model's digest with a sha256: prefix", async () => {
    const client = ollamaClient({
      host: "http://ollama.test",
      fetch: fakeFetch(json(tags)),
    });
    expect(await client.modelDigest("qwen2.5:7b-instruct")).toBe(
      "sha256:845dbda0",
    );
  });

  it("throws InfraError for a model that isn't pulled", async () => {
    const client = ollamaClient({
      host: "http://ollama.test",
      fetch: fakeFetch(json(tags)),
    });
    await expect(client.modelDigest("mistral:7b")).rejects.toBeInstanceOf(
      InfraError,
    );
  });
});
