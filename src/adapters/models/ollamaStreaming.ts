/**
 * Ollama native streaming: POST /api/chat with stream: true (default).
 * Accumulates content and optional thinking from NDJSON chunks.
 * @see https://docs.ollama.com/capabilities/streaming
 * @see https://docs.ollama.com/api/chat
 */

export interface OllamaStreamingOptions {
  /** Base URL of Ollama server (e.g. http://localhost:11434), without /v1 or /api. */
  baseUrl: string;
  model: string;
  /** User message content. */
  message: string;
  /** Optional system prompt. */
  system?: string;
}

export interface OllamaStreamingResult {
  content: string;
  /** Present for thinking-capable models; reasoning trace. */
  reasoning?: string;
}

/**
 * Returns the Ollama server base URL (no /v1). Use this when calling native /api/chat.
 */
export function getOllamaBaseUrl(openAIBaseUrl: string | undefined): string {
  if (!openAIBaseUrl) return "http://localhost:11434";
  const u = openAIBaseUrl.replace(/\/v1\/?$/, "").replace(/\/api\/?$/, "").trim();
  return u || "http://localhost:11434";
}

/**
 * Call Ollama /api/chat with stream: true; accumulate content and optional thinking from chunks.
 * Response is application/x-ndjson: each line is a JSON object with message.content, message.thinking?, done.
 */
export async function ollamaStreamingChat(
  options: OllamaStreamingOptions
): Promise<OllamaStreamingResult> {
  const { baseUrl, model, message, system } = options;
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user" as const, content: message }],
    stream: true,
  };
  if (system != null && system !== "") {
    body.messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: message },
    ];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
  }

  const contentChunks: string[] = [];
  const thinkingChunks: string[] = [];
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed) as {
          message?: { content?: string; thinking?: string };
          done?: boolean;
        };
        const msg = data.message;
        if (msg?.thinking != null && typeof msg.thinking === "string") {
          thinkingChunks.push(msg.thinking);
        }
        if (msg?.content != null && typeof msg.content === "string") {
          contentChunks.push(msg.content);
        }
      } catch {
        // skip malformed line
      }
    }
  }
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer.trim()) as {
        message?: { content?: string; thinking?: string };
      };
      const msg = data.message;
      if (msg?.thinking != null && typeof msg.thinking === "string") {
        thinkingChunks.push(msg.thinking);
      }
      if (msg?.content != null && typeof msg.content === "string") {
        contentChunks.push(msg.content);
      }
    } catch {
      // ignore
    }
  }

  const content = contentChunks.join("").trim();
  const reasoning = thinkingChunks.length > 0 ? thinkingChunks.join("") : undefined;
  return { content, reasoning };
}
