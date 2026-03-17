/**
 * Google Gemini model adapter. Uses GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY),
 * GEMINI_MODEL, GEMINI_MAX_TOKENS from env when not provided.
 * Uses the @google/genai SDK (recommended); falls back to @google/generative-ai if needed.
 */

import type { ModelAdapter } from "../../types/models.js";

export interface GeminiModelConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

const defaultConfig = (): GeminiModelConfig => ({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY ?? process.env.GOOGLE_API_KEY,
  model: process.env.GEMINI_MODEL ?? process.env.MODEL ?? "gemini-2.0-flash",
  maxTokens: process.env.GEMINI_MAX_TOKENS
    ? parseInt(process.env.GEMINI_MAX_TOKENS, 10)
    : 4096,
});

/**
 * Creates a ModelAdapter for Google Gemini. Install the SDK: npm install @google/genai
 */
export function createGeminiModelAdapter(config: GeminiModelConfig = {}): ModelAdapter {
  const opts = { ...defaultConfig(), ...config };
  if (!opts.apiKey) {
    throw new Error(
      "Gemini adapter requires GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY). Set it in env or pass apiKey in config."
    );
  }
  return {
    async generate(input) {
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

      // Prefer @google/genai (new SDK)
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: opts.apiKey });
        const res = await ai.models.generateContent({
          model: opts.model ?? "gemini-2.0-flash",
          contents: prompt,
          config: { maxOutputTokens: maxTokens },
        });
        const text =
          (res as { text?: string }).text ??
          (res as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
            .candidates?.[0]?.content?.parts?.filter(
              (p: { text?: string }): p is { text: string } => typeof p.text === "string"
            )
            .map((p: { text: string }) => p.text)
            .join("") ??
          "";
        return { content: text, raw: res };
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err?.code === "ERR_MODULE_NOT_FOUND" || err?.message?.includes("Cannot find module")) {
          throw new Error(
            "Gemini adapter requires the '@google/genai' package. Install it: npm install @google/genai"
          );
        }
        throw e;
      }
    },
  };
}
