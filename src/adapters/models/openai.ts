/**
 * OpenAI (and OpenAI-compatible) model adapter. Uses OPENAI_API_KEY, OPENAI_BASE_URL,
 * OPENAI_MODEL, OPENAI_MAX_TOKENS from env when not provided.
 */

import type { ModelAdapter } from "../../types/models.js";

export interface OpenAIModelConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
}

const defaultConfig = (): OpenAIModelConfig => ({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL,
  model: process.env.OPENAI_MODEL ?? process.env.MODEL ?? "gpt-4o-mini",
  maxTokens: process.env.OPENAI_MAX_TOKENS
    ? parseInt(process.env.OPENAI_MAX_TOKENS, 10)
    : 4096,
});

/**
 * Creates a ModelAdapter for OpenAI or any OpenAI-compatible API (Ollama, LM Studio, etc.).
 * Install the `openai` package: npm install openai
 */
export function createOpenAIModelAdapter(config: OpenAIModelConfig = {}): ModelAdapter {
  const opts = { ...defaultConfig(), ...config };
  const apiKey = opts.apiKey ?? (opts.baseURL ? "local" : undefined);
  if (!apiKey && !opts.baseURL) {
    throw new Error(
      "OpenAI adapter requires OPENAI_API_KEY (or baseURL for local endpoints). Set OPENAI_API_KEY in env or pass apiKey in config."
    );
  }
  return {
    async generate(input) {
      const openai = await import("openai").catch(() => {
        throw new Error(
          "OpenAI adapter requires the 'openai' package. Install it: npm install openai"
        );
      });
      const client = new openai.default({
        apiKey: apiKey ?? "local",
        baseURL: opts.baseURL,
      });
      const prompt =
        typeof input.prompt === "string"
          ? input.prompt
          : Array.isArray(input.messages) && input.messages.length
            ? (input.messages as { role: string; content: string }[])
                .map((m) => `${m.role}: ${m.content}`)
                .join("\n")
            : "";
      const maxTokens =
        Number.isFinite(opts.maxTokens) && opts.maxTokens! > 0 ? opts.maxTokens! : 4096;
      const completion = await client.chat.completions.create({
        model: opts.model ?? "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
      });
      const content = completion.choices[0]?.message?.content ?? "";
      return { content, raw: completion };
    },
  };
}
