/**
 * One-call quick start: create an agent with default single-step plan and
 * model-based executor. Get running in a few lines, then customize as needed.
 */

import type { ProviderName } from "./runner/createAgentRunner.js";
import { createAgentRunner } from "./runner/createAgentRunner.js";
import type { OpenAIModelConfig } from "./adapters/models/openai.js";
import type { AnthropicModelConfig } from "./adapters/models/anthropic.js";
import type { GeminiModelConfig } from "./adapters/models/gemini.js";
import type { OllamaModelConfig } from "./adapters/models/ollama.js";
import type { LmStudioModelConfig } from "./adapters/models/lmstudio.js";
import { createLLMEvaluator } from "./adapters/createLLMEvaluator.js";
import { createOpenAIModelAdapter } from "./adapters/models/openai.js";
import { createAnthropicModelAdapter } from "./adapters/models/anthropic.js";
import { createGeminiModelAdapter } from "./adapters/models/gemini.js";
import { createOllamaModelAdapter } from "./adapters/models/ollama.js";
import { createLmStudioModelAdapter } from "./adapters/models/lmstudio.js";
import { createSingleStepPlanner } from "./defaults/singleStepPlanner.js";
import { createLLMPlanner } from "./defaults/llmPlanner.js";
import { createDefaultExecutor } from "./defaults/defaultExecutor.js";
import type { AgentRunner } from "./runner/AgentRunner.js";
import type { LLMPlannerOptions } from "./defaults/llmPlanner.js";

export type QuickAgentConfig = {
  /** Provider (uses env for API keys). */
  provider: ProviderName;
  /** Optional model config override. */
  modelConfig?:
    | OpenAIModelConfig
    | AnthropicModelConfig
    | GeminiModelConfig
    | OllamaModelConfig
    | LmStudioModelConfig;
  /** Optional system prompt for the default executor (e.g. "Respond in one sentence."). */
  systemPrompt?: string;
};

export type GoalDrivenAgentConfig = QuickAgentConfig & {
  /** If true, the LLM generates the plan (steps) from the goal; if false, a single implicit step is used. Default false. */
  useLLMPlanner?: boolean;
  /** Options for the LLM planner when useLLMPlanner is true. */
  llmPlannerOptions?: LLMPlannerOptions;
};

function resolveModel(provider: ProviderName, modelConfig: object = {}): import("./types/models.js").ModelAdapter {
  switch (provider) {
    case "openai":
      return createOpenAIModelAdapter(modelConfig as OpenAIModelConfig);
    case "anthropic":
      return createAnthropicModelAdapter(modelConfig as AnthropicModelConfig);
    case "gemini":
      return createGeminiModelAdapter(modelConfig as GeminiModelConfig);
    case "ollama":
      return createOllamaModelAdapter(modelConfig as OllamaModelConfig);
    case "lmstudio":
      return createLmStudioModelAdapter(modelConfig as LmStudioModelConfig);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Create an agent runner with a single-step plan and model-based executor.
 * No tools; just set your provider (and API key in env) and run.
 *
 * @example
 * const runner = createQuickAgent({ provider: "openai" });
 * const run = await runner.run({ goal: "What is 2+2? Explain briefly." });
 * console.log(run.outputs?.answer);
 */
export function createQuickAgent(config: QuickAgentConfig): AgentRunner {
  const { provider, modelConfig = {}, systemPrompt } = config;
  const model = resolveModel(provider, modelConfig);
  const evaluator = createLLMEvaluator(model);
  const planner = createSingleStepPlanner();
  const executor = createDefaultExecutor({ model, systemPrompt });
  return createAgentRunner({
    planner,
    executor,
    evaluator,
    model,
  });
}

/**
 * Create an agent runner that works from a goal only: no steps defined by you.
 * When useLLMPlanner is true, the LLM generates the plan (steps) from the goal;
 * otherwise a single implicit step is used (same as createQuickAgent).
 * No tools; uses default executor and evaluator.
 *
 * @example
 * const runner = createGoalDrivenAgent({ provider: "openai", useLLMPlanner: true });
 * const run = await runner.run({ goal: "Explain quantum computing in 3 steps." });
 * console.log(run.plan.steps, run.outputs);
 */
export function createGoalDrivenAgent(config: GoalDrivenAgentConfig): AgentRunner {
  const { provider, modelConfig = {}, systemPrompt, useLLMPlanner = false, llmPlannerOptions } = config;
  const model = resolveModel(provider, modelConfig);
  const evaluator = createLLMEvaluator(model);
  const planner = useLLMPlanner ? createLLMPlanner(model, llmPlannerOptions ?? {}) : createSingleStepPlanner();
  const executor = createDefaultExecutor({ model, systemPrompt });
  return createAgentRunner({
    planner,
    executor,
    evaluator,
    model,
  });
}
