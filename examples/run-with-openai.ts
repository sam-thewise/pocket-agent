/**
 * Run pocket-agent with OpenAI, Ollama, or LM Studio using the package provider presets.
 *
 * Cloud (OpenAI):   OPENAI_API_KEY=sk-...  then  npm run example:openai
 * Ollama:           npm run example:openai  (defaults to http://localhost:11434/v1, model llama3)
 *                   Or set OPENAI_BASE_URL / OPENAI_MODEL.
 * LM Studio:        OPENAI_BASE_URL=http://localhost:1234/v1 OPENAI_MODEL=local  npm run example:openai
 * LM Studio streaming: USE_LM_STUDIO_STREAMING=1 and OPENAI_BASE_URL to LM Studio.
 */

import type { ProviderName } from "../src/runner/createAgentRunner.js";
import { createAgentRunner } from "../src/runner/createAgentRunner.js";
import { lmStudioStreamingChat, getLMStudioBaseUrl } from "../src/adapters/models/lmStudioStreaming.js";
import type { Plan, StepDefinition } from "../src/types/plan.js";
import type { Planner } from "../src/planner/Planner.js";
import type { StepExecutor } from "../src/executor/StepExecutor.js";
import type { PlannerInput } from "../src/types/planner.js";
import type { ReplanInput } from "../src/types/planner.js";
import type { StepExecutionInput } from "../src/types/executor.js";
import type { StepAttemptResult } from "../src/types/step.js";
import type { ToolAdapter } from "../src/types/tools.js";
import { nowISO } from "../src/utils/time.js";
import { createProjectTools } from "./project-tools.js";

function detectProvider(): ProviderName {
  const explicit = process.env.POCKET_AGENT_PROVIDER as ProviderName | undefined;
  if (explicit && ["openai", "anthropic", "gemini", "ollama", "lmstudio"].includes(explicit)) {
    return explicit;
  }
  const base = process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL ?? "";
  if (base.includes("11434")) return "ollama";
  if (base.includes("1234") || process.env.USE_LM_STUDIO_STREAMING === "1" || process.env.USE_LM_STUDIO_STREAMING === "true") {
    return "lmstudio";
  }
  return "openai";
}

function setProviderEnvDefaults(provider: ProviderName): void {
  if (process.env.OPENAI_BASE_URL && process.env.OPENAI_MODEL) return;
  if (provider === "ollama") {
    if (!process.env.OPENAI_BASE_URL) process.env.OPENAI_BASE_URL = "http://localhost:11434/v1";
    if (!process.env.OPENAI_MODEL) process.env.OPENAI_MODEL = process.env.MODEL ?? "llama3";
  } else if (provider === "lmstudio") {
    if (!process.env.OPENAI_BASE_URL) process.env.OPENAI_BASE_URL = "http://localhost:1234/v1";
    if (!process.env.OPENAI_MODEL) process.env.OPENAI_MODEL = process.env.MODEL ?? "local";
  }
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? process.env.MODEL ?? "gpt-4o-mini";
const OPENAI_MAX_TOKENS = process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS, 10) : 4096;

/** At runtime (e.g. inside executor) use these so env set by setProviderEnvDefaults is seen. */
function effectiveModel(): string {
  return process.env.OPENAI_MODEL ?? process.env.MODEL ?? OPENAI_MODEL;
}
function effectiveMaxTokens(): number {
  const v = process.env.OPENAI_MAX_TOKENS;
  return v ? parseInt(v, 10) : OPENAI_MAX_TOKENS;
}
const MAX_EXECUTION_TIME_MS = process.env.MAX_EXECUTION_TIME_MS ? parseInt(process.env.MAX_EXECUTION_TIME_MS, 10) : undefined;
const USE_LM_STUDIO_STREAMING =
  process.env.USE_LM_STUDIO_STREAMING === "1" || process.env.USE_LM_STUDIO_STREAMING === "true";

const isLocal = Boolean(OPENAI_BASE_URL);
const apiKey = OPENAI_API_KEY ?? (isLocal ? "local" : undefined);

if (!apiKey && !isLocal) {
  console.error("Missing OPENAI_API_KEY. Set it, or use a local endpoint (e.g. provider=ollama or OPENAI_BASE_URL).");
  console.error("  Windows (PowerShell): $env:OPENAI_API_KEY = \"sk-...\"");
  console.error("  Mac/Linux:            export OPENAI_API_KEY=sk-...");
  process.exit(1);
}

async function getOpenAI() {
  const openai = await import("openai");
  const key = apiKey ?? "local";
  const base = process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL ?? OPENAI_BASE_URL;
  const config: { apiKey: string; baseURL?: string } = { apiKey: key };
  if (base) config.baseURL = base;
  return new openai.default(config);
}

const TOOL_NAMES = ["list_directory", "read_file", "grep"] as const;

const DEFAULT_RETRY = { maxAttempts: 2, strategy: "retry_with_feedback" as const };

/** Model-specific adjustments (e.g. temperature for tool calls). First matching entry wins. */
export type ModelAdjustments = {
  toolCallTemperature?: number; // 0–0.3 recommended for tool-calling rounds to reduce bad tool names/args
  defaultTemperature?: number;  // used for non-tool prompts (e.g. synthesize_answer)
};
const MODEL_ADJUSTMENTS: { pattern: string; toolCallTemperature?: number; defaultTemperature?: number }[] = [
  { pattern: "qwen", toolCallTemperature: 0.2, defaultTemperature: 0.7 },
  // Add more: { pattern: "llama", toolCallTemperature: 0.3 }, etc.
];

function getModelAdjustments(modelName: string): ModelAdjustments {
  const lower = modelName.toLowerCase();
  const entry = MODEL_ADJUSTMENTS.find((e) => lower.includes(e.pattern.toLowerCase()));
  return entry
    ? {
        toolCallTemperature: entry.toolCallTemperature,
        defaultTemperature: entry.defaultTemperature,
      }
    : {};
}

/** Multi-step plan: explore structure → read key files → synthesize answer. Uses the runner properly. */
function buildPlan(goal: string, availableTools: string[]): StepDefinition[] {
  const hasListDir = availableTools.includes("list_directory");
  const hasReadFile = availableTools.includes("read_file");
  return [
    {
      id: "explore_structure",
      name: "Explore structure",
      type: "tool",
      objective: "Build the list of what exists so the next step can read only real paths. Use only list_directory: start with '.', then list key dirs (e.g. src, src/runner, src/planner, src/executor). Do not use read_file. Output structure_summary in <final_answer> listing each directory and the files inside it—the next step (read_key_files) will use this as the only source of valid paths.",
      dependencies: [],
      allowedTools: hasListDir ? ["list_directory"] : [],
      inputs: [{ source: "runContext", key: "goal" }],
      outputs: ["structure_summary"],
      completionCriteria: [
        "Structure summary in <final_answer> listing discovered dirs and files",
        "Next step (read_key_files) will use this list to know which paths exist",
      ],
      retryPolicy: DEFAULT_RETRY,
    },
    {
      id: "read_key_files",
      name: "Read key files",
      type: "tool",
      objective: "Read key files. This step receives structure_summary from explore_structure—that is the list of paths that exist. (1) Use structure_summary to know what exists. (2) Use grep to find files containing relevant terms (e.g. createAgentRunner, Planner, StepExecutor). (3) Only call read_file on paths that appear in structure_summary or were returned by grep/list_directory. Never guess paths. Output file contents or summary in <final_answer>.",
      dependencies: ["explore_structure"],
      allowedTools: hasReadFile ? ["read_file", "grep", "list_directory"] : availableTools.includes("grep") ? ["grep", "list_directory"] : [],
      inputs: [
        { source: "stepOutput", stepId: "explore_structure", key: "structure_summary" },
        { source: "runContext", key: "goal" },
      ],
      outputs: ["file_contents"],
      completionCriteria: [
        "Used structure_summary (from previous step) as source of valid paths",
        "Only read_file on paths from structure_summary or grep/list_directory",
        "File contents or summary in <final_answer> block",
      ],
      retryPolicy: DEFAULT_RETRY,
    },
    {
      id: "synthesize_answer",
      name: "Synthesize answer",
      type: "transform",
      objective: "Answer the goal using the structure summary and file contents. Put the complete final answer in <final_answer>.",
      dependencies: ["read_key_files"],
      allowedTools: [],
      inputs: [
        { source: "stepOutput", stepId: "read_key_files", key: "file_contents" },
        { source: "stepOutput", stepId: "explore_structure", key: "structure_summary" },
        { source: "runContext", key: "goal" },
      ],
      outputs: ["answer"],
      completionCriteria: ["Final answer in <final_answer> block"],
      retryPolicy: DEFAULT_RETRY,
    },
  ];
}

/** Build OpenAI API tools array from step's allowedTools and runner's tools map. Uses full JSON Schema for strict tool-calling. */
function buildOpenAITools(
  allowedTools: string[],
  tools: Record<string, ToolAdapter>
): { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[] {
  return allowedTools
    .filter((name) => tools[name])
    .map((name) => {
      const t = tools[name];
      const schema = t.definition.inputSchema ?? { type: "object", properties: {}, additionalProperties: false };
      return {
        type: "function" as const,
        function: {
          name: t.definition.name,
          description: t.definition.description,
          parameters: schema,
        },
      };
    });
}

/** Validate tool arguments against JSON Schema (required + types). Returns a short reason when invalid. */
function validateToolArgs(
  schema: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): { valid: true } | { valid: false; reason: string } {
  if (!schema || typeof schema !== "object") return { valid: true };
  const required = schema.required as string[] | undefined;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (!(key in args) || args[key] === undefined || args[key] === null) {
        return { valid: false, reason: `"${key}" is required` };
      }
    }
  }
  const props = schema.properties as Record<string, { type?: string }> | undefined;
  if (props && typeof props === "object") {
    for (const [key, spec] of Object.entries(props)) {
      if (!(key in args)) continue;
      const v = args[key];
      const t = spec?.type;
      if (t === "string" && typeof v !== "string") return { valid: false, reason: `"${key}" must be a string` };
      if (t === "number" && typeof v !== "number") return { valid: false, reason: `"${key}" must be a number` };
    }
  }
  return { valid: true };
}

/** Max chars for a single tool result in conversation history; larger results are truncated to keep history stable. */
const MAX_TOOL_RESULT_CHARS = 12_000;

function truncateToolResultForHistory(result: unknown): string {
  const raw = JSON.stringify(result);
  if (raw.length <= MAX_TOOL_RESULT_CHARS) return raw;
  const r = result as Record<string, unknown>;
  if (r && typeof r === "object" && typeof r.content === "string") {
    const keep = MAX_TOOL_RESULT_CHARS - 80;
    const truncated = r.content.slice(0, keep) + "\n\n...[truncated for context]";
    return JSON.stringify({ ...r, content: truncated });
  }
  return JSON.stringify({ _truncated: true, _preview: raw.slice(0, MAX_TOOL_RESULT_CHARS - 50) });
}

const DEBUG = process.env.DEBUG !== undefined && process.env.DEBUG !== "0";
const QUIET = process.env.QUIET === "1" || process.env.QUIET === "true";
function notify(msg: string): void {
  if (!QUIET) console.log(msg);
}

function summarizeToolResult(toolName: string, result: unknown): string {
  if (result == null) return "ok";
  const r = result as Record<string, unknown>;
  if (r.error && typeof r.error === "string") {
    const pathPart = r.path != null ? ` (path: ${JSON.stringify(r.path)})` : "";
    const errLen = DEBUG ? r.error.length : 120;
    return `error: ${r.error.slice(0, errLen)}${pathPart}`;
  }
  if (toolName === "list_directory" && Array.isArray(r.entries)) return `${r.entries.length} entries`;
  if (toolName === "read_file" && typeof r.content === "string") return `${r.content.length} chars`;
  if (toolName === "grep" && Array.isArray(r.files)) return `${r.files.length} files`;
  return "ok";
}

const FINAL_ANSWER_TAG = "final_answer";

/** Extract <final_answer>...</final_answer> content. Case-insensitive. Fallback: if model put content after </final_answer>, use that. */
function extractFinalAnswerBlock(content: string): string | null {
  const openLower = content.toLowerCase();
  const tagLower = FINAL_ANSWER_TAG.toLowerCase();
  const startIdx = openLower.indexOf(`<${tagLower}>`);
  const endIdx = openLower.indexOf(`</${tagLower}>`);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const openTagEnd = content.indexOf(">", startIdx) + 1;
    const between = content.slice(openTagEnd, endIdx).trim();
    if (between.length > 0) return between;
  }
  if (endIdx !== -1) {
    const afterClose = content.indexOf(">", endIdx) + 1;
    const after = content.slice(afterClose).trim();
    if (after.length > 0) return after;
  }
  return null;
}

/**
 * Tool-calling loop for one step: run until we receive the <final_answer>...</final_answer> block.
 * Returns the block content so the executor can map it to this step's outputs.
 */
async function runWithToolCalling(
  input: StepExecutionInput
): Promise<{ content: string } | { error: string }> {
  try {
    const openai = await getOpenAI();
    const tools = input.tools ?? {};
    const allowed = (input.step.allowedTools ?? []).filter((n) => tools[n]);
    if (allowed.length === 0) return { error: "No tools available for this step" };

    const openaiTools = buildOpenAITools(input.step.allowedTools ?? [], tools);
    const allowedNames = openaiTools.map((t) => t.function.name);
    const toolList = allowedNames.join(", ");
    const contextStr = JSON.stringify(input.runContext, null, 2);
    const resolvedStr = JSON.stringify(input.resolvedInputs, null, 2);
    const blockInstruction = `When done with tools, output your step result inside a single block. First line: <${FINAL_ANSWER_TAG}>. Next lines: your content. Last line: </${FINAL_ANSWER_TAG}>. The entire answer must be between these two tags; do not put the closing tag before the content.`;
    const pathRule =
      input.step.id === "read_key_files"
        ? " Path rule: only call read_file on paths from structure_summary or grep/list_directory. Never guess paths."
        : "";
    const toolProtocol =
      `TOOL PROTOCOL: There are exactly ${allowedNames.length} tools; their names are the only valid tool names: ${toolList}. ` +
      `To list a directory, call the tool named list_directory with a JSON object that has one key "path" (e.g. list_directory with {"path":"src/runner"}). ` +
      `Names that appear in list_directory results (e.g. "src", "runner", "examples") are path parts or entry names—they are NOT tool names. Never call a tool named "src" or "runner"; call list_directory with {"path":"src"} or {"path":"src/runner"}. ` +
      `read_file takes {"path":"file/path.ts"} only; grep takes {"pattern":"..."} and optional path/filePattern/maxMatches.`;
    const systemContent = `You are a helpful assistant. Paths are relative to the project root. ${toolProtocol}${pathRule} ${blockInstruction}`;
    const userContent = `Step objective: ${input.step.objective}\n\nRun context: ${contextStr}\nResolved inputs from previous steps: ${resolvedStr}\n\nAvailable tools for this step: ${toolList}. Use them as needed, then output this step's result inside <${FINAL_ANSWER_TAG}>...</${FINAL_ANSWER_TAG}>.`;

    type Message =
      | { role: "user"; content: string }
      | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
      | { role: "tool"; content: string; tool_call_id: string };

    const messages: Message[] = [
      { role: "user", content: systemContent + "\n\n" + userContent },
    ];

    const adj = getModelAdjustments(effectiveModel());
    const toolCallParams =
      adj.toolCallTemperature != null ? { temperature: adj.toolCallTemperature } : {};
    const maxRounds = 100;
    for (let round = 0; round < maxRounds; round++) {
      notify(`  [step ${input.step.id}] Round ${round + 1}`);
      if (DEBUG) console.error(`[tool-call] round ${round + 1}/${maxRounds}`);

      const completion = await openai.chat.completions.create({
        model: effectiveModel(),
        messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
        tools: openaiTools.length ? openaiTools : undefined,
        max_tokens: Number.isFinite(effectiveMaxTokens()) && effectiveMaxTokens() > 0 ? effectiveMaxTokens() : 4096,
        ...toolCallParams,
      });
      const msg = completion.choices[0]?.message;
      if (!msg) return { error: "No response from model" };

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: toolCalls.map((tc) => ({
            id: String(tc.id),
            type: (tc.type ?? "function") as "function",
            function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "{}" },
          })),
        });
        for (const tc of toolCalls) {
          const name = tc.function?.name ?? "";
          const rawArgs = tc.function?.arguments ?? "{}";
          const adapter = name ? tools[name] : undefined;

          if (!adapter) {
            const correction =
              `Invalid: "${name}" is not a tool. Valid tool names are only: ${toolList}. ` +
              `Path or entry names (e.g. "src", "runner") go in the "path" argument of list_directory, not as the tool name. Example: list_directory({"path":"src"}).`;
            notify(`  [tool] invalid name: ${name} → sending correction`);
            messages.push({ role: "tool", content: correction, tool_call_id: String(tc.id) });
            continue;
          }

          let args: Record<string, unknown>;
          try {
            args = (JSON.parse(rawArgs) as Record<string, unknown>) ?? {};
          } catch {
            args = {};
          }

          const schema = adapter.definition.inputSchema as Record<string, unknown> | undefined;
          const validation = validateToolArgs(schema, args);
          if (!validation.valid) {
            const example =
              name === "list_directory"
                ? '{"path":"src"}'
                : name === "read_file"
                  ? '{"path":"src/index.ts"}'
                  : name === "grep"
                    ? '{"pattern":"Planner"}'
                    : "{}";
            const correction = `Invalid arguments for ${name}: ${validation.reason}. Example: ${example}.`;
            notify(`  [tool] invalid args for ${name}: ${validation.reason}`);
            messages.push({ role: "tool", content: correction, tool_call_id: String(tc.id) });
            continue;
          }

          notify(`  [tool] ${name}(${JSON.stringify(args)})`);
          const result = await adapter.invoke(args, {
            runId: input.runId,
            stepId: input.step.id,
            attempt: input.attempt,
          });
          const summary = summarizeToolResult(name, result);
          notify(`  [tool] ${name} → ${summary}`);
          messages.push({
            role: "tool",
            content: truncateToolResultForHistory(result),
            tool_call_id: String(tc.id),
          });
        }
        continue;
      }

      // No tool_calls: check for <final_answer> block. If missing, ask once for it (no tools).
      const contentSoFar = (msg.content ?? "").trim();
      messages.push({ role: "assistant", content: contentSoFar || null });

      let toParse = contentSoFar;
      let lastFinishReason: string | undefined = completion.choices[0]?.finish_reason;
      if (!extractFinalAnswerBlock(toParse)) {
        notify(`  [step ${input.step.id}] No <final_answer> yet, requesting block (no tools)`);
        const outputKey = input.step.outputs?.[0] ?? "output";
        const requestPrompt =
          `Output your ${outputKey} now. Format: first line must be <${FINAL_ANSWER_TAG}>, then your content, then </${FINAL_ANSWER_TAG}>. ` +
          `Do not write the closing tag before the content. Put the entire ${outputKey} between the two tags.\n\nStep objective: ${input.step.objective}`;
        messages.push({ role: "user", content: requestPrompt });

        const lmBase = getLMStudioBaseUrl(process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL ?? OPENAI_BASE_URL);
        if (USE_LM_STUDIO_STREAMING && lmBase) {
          const streamed = await lmStudioStreamingChat({
            baseUrl: lmBase,
            model: effectiveModel(),
            userMessage: requestPrompt,
            temperature: adj.toolCallTemperature ?? undefined,
            maxOutputTokens: Number.isFinite(effectiveMaxTokens()) && effectiveMaxTokens() > 0 ? effectiveMaxTokens() : 4096,
            apiKey: apiKey ?? "local",
          });
          toParse = streamed.content;
        } else {
          const synthesis = await openai.chat.completions.create({
            model: effectiveModel(),
            messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
            max_tokens: Number.isFinite(effectiveMaxTokens()) && effectiveMaxTokens() > 0 ? effectiveMaxTokens() : 4096,
            ...toolCallParams,
          });
          const synthesisMsg = synthesis.choices[0]?.message;
          toParse = (synthesisMsg?.content ?? "").trim();
          lastFinishReason = synthesis.choices[0]?.finish_reason;
        }
      }

      const content = extractFinalAnswerBlock(toParse);
      if (content) {
        const truncated = lastFinishReason === "length";
        return {
          content: truncated ? content + "\n\n[Truncated by token limit.]" : content,
        };
      }
      // Debug: show what the model returned so we can see wrong tags, empty, etc.
      const snippet = toParse.length > 0 ? toParse.slice(0, 400).replace(/\n/g, " ") : "(empty)";
      notify(`  [debug] Model did not output <final_answer> block. Response length: ${toParse.length}. Snippet: ${snippet}${toParse.length > 400 ? "…" : ""}`);
      if (DEBUG && toParse.length > 0) console.error("[tool-call] full last response:", toParse);
      return { error: "Model did not output <final_answer>...</final_answer> block" };
    }
    return { error: "Max tool-calling rounds reached without final answer" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (DEBUG) console.error("[tool-call] error:", err);
    return { error: message };
  }
}

const planner: Planner = {
  async createPlan(input: PlannerInput): Promise<Plan> {
    const availableTools = input.availableTools.map((t) => t.name);
    const steps = buildPlan(input.goal, availableTools);
    return {
      id: "plan-1",
      version: 1,
      goal: input.goal,
      steps,
      createdAt: nowISO(),
    };
  },
  async replan(input: ReplanInput): Promise<Plan> {
    const availableTools = input.availableTools.map((t) => t.name);
    const steps = buildPlan(input.goal, availableTools);
    return {
      ...input.currentPlan,
      version: input.currentPlan.version + 1,
      steps,
    };
  },
};

/** Build step output from step.outputs and the single content string (first output key gets the content). */
function stepOutputFromContent(step: StepExecutionInput["step"], content: string): Record<string, unknown> {
  const key = step.outputs?.[0] ?? "output";
  return { [key]: content };
}

const executor: StepExecutor = {
  async execute(input: StepExecutionInput): Promise<StepAttemptResult> {
    const model = input.model;
    if (!model) {
      return {
        stepId: input.step.id,
        attempt: input.attempt,
        status: "error",
        error: { code: "NO_MODEL", message: "No model adapter provided" },
        startedAt: nowISO(),
        completedAt: nowISO(),
        durationMs: 0,
      };
    }
    const startedAt = nowISO();
    const hasTools = (input.step.allowedTools?.length ?? 0) > 0 && Object.keys(input.tools ?? {}).length > 0;

    if (hasTools) {
      const result = await runWithToolCalling(input);
      const completedAt = nowISO();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      if ("error" in result) {
        return {
          stepId: input.step.id,
          attempt: input.attempt,
          status: "error",
          error: { code: "TOOL_LOOP_ERROR", message: result.error },
          startedAt,
          completedAt,
          durationMs,
        };
      }
      const structuredOutput = stepOutputFromContent(input.step, result.content);
      return {
        stepId: input.step.id,
        attempt: input.attempt,
        status: "success",
        structuredOutput,
        rawOutput: result.content,
        startedAt,
        completedAt,
        durationMs,
      };
    }

    // No-tool step (e.g. synthesize_answer): one model call with resolvedInputs, ask for <final_answer>
    notify(`  [step ${input.step.id}] Calling model for final answer (no tools)`);
    const contextStr = JSON.stringify(input.resolvedInputs, null, 2);
    const prompt = `You have gathered context from previous steps. Write ONLY the direct answer to the user's question, in 1-3 sentences, inside the block.

Inputs from previous steps and context:
${contextStr}

STRICT RULES for the content inside <${FINAL_ANSWER_TAG}>:
- Only the answer text. No "Thinking Process", no "1." or "2." steps, no "Analyze", "Draft", "Refine", or "Final Check".
- No meta-commentary. The block must read as if you are speaking directly to the user—just the answer.
- One short paragraph or 1-3 sentences maximum.

Output your answer inside exactly this block: <${FINAL_ANSWER_TAG}>
</${FINAL_ANSWER_TAG}>`;
    const out = await model.generate({ prompt });
    const raw = (out.content ?? "").trim();
    const content = extractFinalAnswerBlock(raw) ?? raw;
    const completedAt = nowISO();
    const structuredOutput = stepOutputFromContent(input.step, content);
    return {
      stepId: input.step.id,
      attempt: input.attempt,
      status: "success",
      structuredOutput,
      rawOutput: content,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  },
};

async function main() {
  const provider = detectProvider();
  setProviderEnvDefaults(provider);
  const projectRoot = process.cwd();
  const tools = createProjectTools(projectRoot);

  console.log("Provider:", provider);
  if (OPENAI_BASE_URL) {
    console.log("Using API URL:", OPENAI_BASE_URL);
    console.log("Model:", OPENAI_MODEL);
  } else {
    console.log("Model:", OPENAI_MODEL);
  }
  const modelAdj = getModelAdjustments(OPENAI_MODEL);
  if (modelAdj.toolCallTemperature != null || modelAdj.defaultTemperature != null) {
    const parts: string[] = [];
    if (modelAdj.toolCallTemperature != null) parts.push(`tool-call temp ${modelAdj.toolCallTemperature}`);
    if (modelAdj.defaultTemperature != null) parts.push(`default temp ${modelAdj.defaultTemperature}`);
    console.log("Model adjustments:", parts.join(", "));
  }
  if (USE_LM_STUDIO_STREAMING && getLMStudioBaseUrl(process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL ?? OPENAI_BASE_URL)) {
    console.log("LM Studio native streaming: on (message only for answers; reasoning separate)");
  }
  const useOllamaStreaming = process.env.OLLAMA_USE_STREAMING === "1" || process.env.OLLAMA_USE_STREAMING === "true";
  if (provider === "ollama" && useOllamaStreaming) {
    console.log("Ollama native streaming: on (content + thinking from /api/chat)");
  }
  console.log("Project root:", projectRoot);
  if (MAX_EXECUTION_TIME_MS != null && Number.isFinite(MAX_EXECUTION_TIME_MS)) {
    console.log("Max execution time:", MAX_EXECUTION_TIME_MS, "ms");
  }
  console.log("Tools: list_directory, read_file, grep (agent can explore and search the repo)\n");

  const runner = createAgentRunner({
    provider,
    modelConfig: {
      baseURL: process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL,
      model: effectiveModel(),
      maxTokens: effectiveMaxTokens(),
      ...(provider === "lmstudio" && {
        useNativeStreaming: USE_LM_STUDIO_STREAMING,
      }),
      ...(provider === "ollama" && {
        useNativeStreaming: useOllamaStreaming,
      }),
    },
    planner,
    executor,
    tools,
  });

  const goal =
    process.argv[2] ??
    "Architecturally, how does this project work? Describe the main components, entry points, and how they fit together.";
  const context = {
    goal,
    projectRoot,
    projectName: "pocket-agent",
    description: "Reusable Node.js framework for plan-driven agent execution",
  };
  const runOptions =
    MAX_EXECUTION_TIME_MS != null && Number.isFinite(MAX_EXECUTION_TIME_MS) && MAX_EXECUTION_TIME_MS > 0
      ? { maxExecutionTimeMs: MAX_EXECUTION_TIME_MS }
      : undefined;

  const execution = runner.start({ goal, context, options: runOptions });

  execution.on("run.started", () => {
    console.log("[runner] Run started");
  });
  execution.on("plan.created", (event) => {
    const plan = (event as { plan?: { steps?: { id: string; name: string }[] } }).plan;
    const steps = plan?.steps ?? [];
    console.log("\n[runner] Plan created:", steps.length, "step(s)");
    steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.id} (${s.name})`));
  });
  execution.on("step.started", (event) => {
    const e = event as { stepId?: string; attempt?: number };
    console.log(`[runner] Step started: ${e.stepId ?? "?"} (attempt ${e.attempt ?? 1})`);
  });
  execution.on("step.completed", (event) => {
    const e = event as { stepId?: string };
    console.log(`[runner] Step completed: ${e.stepId ?? "?"}`);
  });
  execution.on("step.retrying", (event) => {
    const e = event as { stepId?: string; attempt?: number };
    console.log(`[runner] Step retrying: ${e.stepId ?? "?"} (attempt ${e.attempt ?? "?"})`);
  });
  execution.on("step.failed", (event) => {
    const e = event as { stepId?: string; error?: unknown };
    console.error(`[runner] Step failed: ${e.stepId ?? "?"}`, e.error ?? "");
  });
  execution.on("run.completed", () => {
    console.log("[runner] Run completed");
  });
  execution.on("run.failed", (event) => {
    console.error("[runner] Run failed", (event as { error?: unknown }).error ?? "");
  });

  const run = await execution.result;

  console.log("\n--- Result ---");
  console.log("Goal:", goal);
  console.log("Status:", run.status);
  console.log("Plan steps:", run.plan.steps.map((s) => s.id).join(" → "));
  const answer = run.outputs?.answer ?? run.steps["synthesize_answer"]?.finalOutput?.answer;
  if (answer) {
    console.log("\nAnswer:\n");
    console.log(typeof answer === "string" ? answer : JSON.stringify(answer, null, 2));
  } else {
    console.log("Answer: (none)");
    const failedStep = run.plan.steps.find((s) => run.steps[s.id]?.status === "failed");
    const stepRecord = failedStep ? run.steps[failedStep.id] : undefined;
    const lastAttempt = stepRecord?.attempts?.slice(-1)[0];
    const stepError = lastAttempt?.error ?? stepRecord?.latestEvaluation?.reasons?.[0];
    if (stepError) {
      const msg = typeof stepError === "object" && stepError !== null && "message" in stepError
        ? (stepError as { message?: string }).message
        : String(stepError);
      console.error("\nError:", msg);
    }
  }
  if (run.status === "failed" && OPENAI_BASE_URL) {
    console.log("\nTip: If using a local server, ensure it is running (e.g. ollama serve, or LM Studio server started).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
