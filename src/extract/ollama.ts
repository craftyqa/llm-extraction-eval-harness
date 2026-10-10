import type { ModelOptions } from "./types.ts";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  /** JSON Schema for constrained output. */
  format: unknown;
  options: ModelOptions;
};

export type ChatResponse = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  /** `"length"` when generation hit `num_predict`. */
  doneReason: string;
};

/** What extraction needs from a model runtime. Tests pass a fake. */
export type ModelClient = {
  chat(request: ChatRequest): Promise<ChatResponse>;
  /** The digest of a pulled model, e.g. `sha256:845d…`. */
  modelDigest(model: string): Promise<string>;
};

/**
 * Ollama or the network failed. Never a model failure (docs/specs.md, Retry
 * policy): the result is reported separately and the run is retried, not scored.
 */
export class InfraError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InfraError";
  }
}

export type OllamaClientOptions = {
  /** Defaults to `$OLLAMA_HOST`, else `http://localhost:11434`. */
  host?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

type OllamaChatBody = {
  message?: { content?: unknown };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  done_reason?: unknown;
};

type OllamaTagsBody = {
  models?: { name?: unknown; digest?: unknown }[];
};

/** A `ModelClient` over Ollama's HTTP API (`/api/chat`, `/api/tags`). */
export function ollamaClient(options: OllamaClientOptions = {}): ModelClient {
  const host = withScheme(
    options.host ?? process.env["OLLAMA_HOST"] ?? "http://localhost:11434",
  );
  const timeoutMs = options.timeoutMs ?? 600_000;
  const fetchImpl = options.fetch ?? fetch;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, host), {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new InfraError(`Ollama request to ${path} failed`, {
        cause: error,
      });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new InfraError(
        `Ollama ${path} returned ${String(response.status)}: ${body}`,
      );
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new InfraError(`Ollama ${path} returned invalid JSON`, {
        cause: error,
      });
    }
  }

  return {
    async chat(request) {
      const body = await call<OllamaChatBody>("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          format: request.format,
          options: request.options,
          stream: false,
          // Thinking off explicitly (docs/specs.md); ignored by models without it
          think: false,
        }),
      });
      const content = body.message?.content;
      if (typeof content !== "string") {
        throw new InfraError(
          "Ollama /api/chat response has no message content",
        );
      }
      return {
        content,
        promptTokens: numberOr0(body.prompt_eval_count),
        completionTokens: numberOr0(body.eval_count),
        doneReason:
          typeof body.done_reason === "string" ? body.done_reason : "",
      };
    },

    async modelDigest(model) {
      const body = await call<OllamaTagsBody>("/api/tags");
      const entry = body.models?.find((m) => m.name === model);
      if (entry === undefined || typeof entry.digest !== "string") {
        throw new InfraError(`Model ${model} is not pulled in Ollama`);
      }
      return entry.digest.startsWith("sha256:")
        ? entry.digest
        : `sha256:${entry.digest}`;
    },
  };
}

function withScheme(host: string): string {
  return /^https?:\/\//u.test(host) ? host : `http://${host}`;
}

function numberOr0(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
