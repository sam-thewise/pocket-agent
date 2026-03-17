/**
 * Ollama model adapter. Uses OpenAI-compatible API at http://localhost:11434/v1 by default.
 * Optional native streaming (POST /api/chat with stream: true) for content + thinking.
 * No API key required for local Ollama.
 * @see https://docs.ollama.com/capabilities/streaming
 */

import type { ModelAdapter } from "../../types/models.js";
import type { ModelGenerateInput } from "../../types/models.js";
import { createOpenAIModelAdapter } from "./openai.js";
import type { OpenAIModelConfig } from "./openai.js";
import { ollamaStreamingChat, getOllamaBaseUrl } from "./ollamaStreaming.js";

export interface OllamaModelConfig {
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  /** Use native Ollama /api/chat streaming (content + thinking). Default from OLLAMA_USE_STREAMING env. */
  useNativeStreaming?: boolean;
}

const defaultBaseURL = "http://localhost:11434/v1";
const defaultModel = "llama3";

const defaultConfig = (): OpenAIModelConfig & { useNativeStreaming?: boolean } => ({
  apiKey: "local",
  baseURL: process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL ?? defaultBaseURL,
  model: process.env.OPENAI_MODEL ?? process.env.MODEL ?? defaultModel,
  maxTokens: process.env.OPENAI_MAX_TOKENS
    ? parseInt(process.env.OPENAI_MAX_TOKENS, 10)
    : 4096,
  useNativeStreaming:
    process.env.OLLAMA_USE_STREAMING === "1" || process.env.OLLAMA_USE_STREAMING === "true",
});

/**
 * Creates a ModelAdapter for Ollama. When useNativeStreaming is true, generate() uses
 * native /api/chat streaming (content and optional thinking). Otherwise uses the
 * OpenAI-compatible endpoint. Uses OPENAI_BASE_URL (default http://localhost:11434/v1),
 * OPENAI_MODEL (default llama3). Install the `openai` package for non-streaming.
 */
export function createOllamaModelAdapter(config: OllamaModelConfig = {}): ModelAdapter {
  const opts = { ...defaultConfig(), ...config };
  const useStreaming = opts.useNativeStreaming === true;
  const baseURL = opts.baseURL ?? defaultBaseURL;
  const ollamaBase = getOllamaBaseUrl(baseURL);

  if (useStreaming) {
    return {
      async generate(input: ModelGenerateInput) {
        const message =
          typeof input.prompt === "string"
            ? input.prompt
            : Array.isArray(input.messages) && input.messages.length
              ? (input.messages as { role: string; content: string }[])
                  .map((m) => `${m.role}: ${m.content}`)
                  .join("\n")
              : "";
        const result = await ollamaStreamingChat({
          baseUrl: ollamaBase,
          model: opts.model ?? defaultModel,
          message,
        });
        return {
          content: result.content,
          raw: result.reasoning != null ? { reasoning: result.reasoning } : undefined,
        };
      },
    };
  }

  const openaiOpts: OpenAIModelConfig = {
    apiKey: "local",
    baseURL,
    model: opts.model ?? defaultModel,
    maxTokens: opts.maxTokens,
  };
  return createOpenAIModelAdapter(openaiOpts);
}
