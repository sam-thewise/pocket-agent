/**
 * Anthropic Claude model adapter. Uses ANTHROPIC_API_KEY, ANTHROPIC_MODEL,
 * ANTHROPIC_MAX_TOKENS from env when not provided.
 */

import type { ModelAdapter } from "../../types/models.js";

export interface AnthropicModelConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

const defaultConfig = (): AnthropicModelConfig => ({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL ?? process.env.MODEL ?? "claude-3-5-sonnet-20241022",
  maxTokens: process.env.ANTHROPIC_MAX_TOKENS
    ? parseInt(process.env.ANTHROPIC_MAX_TOKENS, 10)
    : 4096,
});

/**
 * Creates a ModelAdapter for Anthropic Claude. Install the SDK: npm install @anthropic-ai/sdk
 */
export function createAnthropicModelAdapter(config: AnthropicModelConfig = {}): ModelAdapter {
  const opts = { ...defaultConfig(), ...config };
  if (!opts.apiKey) {
    throw new Error(
      "Anthropic adapter requires ANTHROPIC_API_KEY. Set it in env or pass apiKey in config."
    );
  }
  return {
    async generate(input) {
      const Anthropic = (await import("@anthropic-ai/sdk").catch(() => {
        throw new Error(
          "Anthropic adapter requires the '@anthropic-ai/sdk' package. Install it: npm install @anthropic-ai/sdk"
        );
      })).default;
      const client = new Anthropic({ apiKey: opts.apiKey });
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
      const message = await client.messages.create({
        model: opts.model ?? "claude-3-5-sonnet-20241022",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = message.content?.find(
        (b: { type: string; text?: string }): b is { type: "text"; text: string } => b.type === "text"
      );
      const content = textBlock?.text ?? "";
      return { content, raw: message };
    },
  };
}
