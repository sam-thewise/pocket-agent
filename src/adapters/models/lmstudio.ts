/**
 * LM Studio model adapter. Supports OpenAI-compatible API and optional native
 * streaming (POST /api/v1/chat with stream: true) to separate reasoning from message.
 */

import type { ModelAdapter } from "../../types/models.js";
import type { ModelGenerateInput } from "../../types/models.js";
import { createOpenAIModelAdapter } from "./openai.js";
import type { OpenAIModelConfig } from "./openai.js";
import { lmStudioStreamingChat, getLMStudioBaseUrl } from "./lmStudioStreaming.js";

export interface LmStudioModelConfig {
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  /** Use LM Studio native streaming for generate() when true. Default from USE_LM_STUDIO_STREAMING env. */
  useNativeStreaming?: boolean;
  apiKey?: string;
}

const defaultBaseURL = "http://localhost:1234/v1";
const defaultModel = "local";

const defaultConfig = (): LmStudioModelConfig => ({
  baseURL: process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL ?? defaultBaseURL,
  model: process.env.OPENAI_MODEL ?? process.env.MODEL ?? defaultModel,
  maxTokens: process.env.OPENAI_MAX_TOKENS
    ? parseInt(process.env.OPENAI_MAX_TOKENS, 10)
    : 4096,
  useNativeStreaming:
    process.env.USE_LM_STUDIO_STREAMING === "1" ||
    process.env.USE_LM_STUDIO_STREAMING === "true",
  apiKey: process.env.OPENAI_API_KEY ?? "local",
});

/**
 * Creates a ModelAdapter for LM Studio. When useNativeStreaming is true, generate()
 * uses LM Studio's native streaming API (reasoning and message separated).
 * Otherwise uses the OpenAI-compatible endpoint. Install the `openai` package for non-streaming.
 */
export function createLmStudioModelAdapter(config: LmStudioModelConfig = {}): ModelAdapter {
  const opts = { ...defaultConfig(), ...config };
  const useStreaming = opts.useNativeStreaming === true;
  const baseUrl = opts.baseURL ?? defaultBaseURL;
  const lmBase = getLMStudioBaseUrl(baseUrl);

  if (useStreaming && lmBase) {
    return {
      async generate(input: ModelGenerateInput) {
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
        const result = await lmStudioStreamingChat({
          baseUrl: lmBase,
          model: opts.model ?? defaultModel,
          userMessage: prompt,
          maxOutputTokens: maxTokens,
          apiKey: opts.apiKey,
        });
        return { content: result.content, raw: { reasoning: result.reasoning } };
      },
    };
  }

  const openaiConfig: OpenAIModelConfig = {
    apiKey: opts.apiKey ?? "local",
    baseURL: baseUrl,
    model: opts.model ?? defaultModel,
    maxTokens: opts.maxTokens,
  };
  return createOpenAIModelAdapter(openaiConfig);
}
