/**
 * LM Studio native streaming: POST /api/v1/chat with stream: true.
 * Separates reasoning from message content. See https://lmstudio.ai/docs/developer/rest/streaming-events
 */

export interface LMStudioStreamingOptions {
  baseUrl: string;
  model: string;
  systemPrompt?: string;
  userMessage: string;
  temperature?: number;
  maxOutputTokens?: number;
  apiKey?: string;
}

export interface LMStudioStreamingResult {
  content: string;
  reasoning?: string;
}

export async function lmStudioStreamingChat(
  options: LMStudioStreamingOptions
): Promise<LMStudioStreamingResult> {
  const {
    baseUrl,
    model,
    systemPrompt,
    userMessage,
    temperature,
    maxOutputTokens,
    apiKey,
  } = options;
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/chat`;
  const body: Record<string, unknown> = {
    model,
    input: userMessage,
    stream: true,
  };
  if (systemPrompt != null && systemPrompt !== "") body.system_prompt = systemPrompt;
  if (temperature != null) body.temperature = temperature;
  if (maxOutputTokens != null && maxOutputTokens > 0) body.max_output_tokens = maxOutputTokens;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "local") headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    throw new Error(`LM Studio chat failed: ${res.status} ${res.statusText}`);
  }

  const reasoningChunks: string[] = [];
  const messageChunks: string[] = [];
  let currentEvent: string | null = null;
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
        continue;
      }
      if (line.startsWith("data: ")) {
        const dataStr = line.slice(6).trim();
        if (dataStr === "" || dataStr === "[DONE]") {
          currentEvent = null;
          continue;
        }
        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>;
          const eventType = (currentEvent ?? data.type) as string | undefined;
          if (eventType === "reasoning.delta" && typeof data.content === "string") {
            reasoningChunks.push(data.content);
          }
          if (eventType === "message.delta" && typeof data.content === "string") {
            messageChunks.push(data.content);
          }
          if (eventType === "chat.end") {
            const result = (data.result ?? data) as {
              output?: Array<{ type?: string; content?: string }>;
            };
            const output =
              result?.output ?? (Array.isArray(data.output) ? data.output : null);
            if (Array.isArray(output)) {
              const messages = output
                .filter(
                  (item): item is { type: string; content: string } =>
                    item?.type === "message" && typeof item.content === "string"
                )
                .map((item) => item.content);
              if (messages.length > 0) {
                messageChunks.length = 0;
                messageChunks.push(messages.join("\n"));
              }
            }
          }
        } catch {
          // ignore malformed data line
        }
        currentEvent = null;
      }
    }
  }

  const content = messageChunks.join("").trim();
  const reasoning = reasoningChunks.length > 0 ? reasoningChunks.join("") : undefined;
  if (!content && res.ok) {
    throw new Error(
      "LM Studio stream returned no message content (check event format or use OpenAI-compatible endpoint)"
    );
  }
  return { content, reasoning };
}

/** Strip /v1 from base URL for LM Studio native API. */
export function getLMStudioBaseUrl(openAIBaseUrl: string | undefined): string | null {
  if (!openAIBaseUrl) return null;
  const u = openAIBaseUrl.replace(/\/v1\/?$/, "");
  return u || null;
}
