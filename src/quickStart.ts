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

/**
 * Configuration for {@link createQuickAgent}.
 *
 * At minimum you specify a {@link ProviderName} (e.g. `"openai"`), and the
 * provider-specific adapter reads API keys and defaults from the environment.
 */
export type QuickAgentConfig = {
  /**
   * Provider backend to use for the underlying LLM.
   *
   * This determines which model adapter is created:
   * - `"openai"`
   * - `"anthropic"`
   * - `"gemini"`
   * - `"ollama"`
   * - `"lmstudio"`
   *
   * Each adapter reads its API key and base URL from env variables by default.
   */
  provider: ProviderName;
  /**
   * Optional model configuration override for the chosen provider.
   * If omitted, sensible defaults and env vars are used.
   */
  modelConfig?:
    | OpenAIModelConfig
    | AnthropicModelConfig
    | GeminiModelConfig
    | OllamaModelConfig
    | LmStudioModelConfig;
  /**
   * Optional system prompt for the default executor
   * (e.g. `"Respond in one sentence."`).
   */
  systemPrompt?: string;
};

/**
 * Configuration for {@link createGoalDrivenAgent}.
 */
export type GoalDrivenAgentConfig = QuickAgentConfig & {
  /**
   * If true, the LLM generates the plan (steps) from the goal.
   * If false, a single implicit step is used (same as {@link createQuickAgent}).
   *
   * @default false
   */
  useLLMPlanner?: boolean;
  /**
   * Options for the LLM planner when {@link GoalDrivenAgentConfig.useLLMPlanner}
   * is true.
   */
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
 *
 * This is the simplest way to use pocket-agent: you set a provider (and its
 * API key in the environment), then call `runner.run({ goal })` to get an
 * answer. No custom planner, executor, tools, or evaluator are required.
 *
 * @example
 * ```ts
 * import { createQuickAgent } from "pocket-agent";
 *
 * const runner = createQuickAgent({ provider: "openai" });
 * const run = await runner.run({ goal: "What is 2+2? Explain briefly." });
 * console.log(run.outputs?.answer);
 * ```
 *
 * @param config - Provider and optional model/system prompt configuration.
 * @returns An {@link AgentRunner} with a `run({ goal, context? })` method.
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
 *
 * When {@link GoalDrivenAgentConfig.useLLMPlanner} is true, the LLM generates
 * the plan (steps) from the goal; otherwise a single implicit step is used
 * (same behavior as {@link createQuickAgent}). No tools; uses the default
 * executor and LLM-based evaluator.
 *
 * @example
 * ```ts
 * import { createGoalDrivenAgent } from "pocket-agent";
 *
 * const runner = createGoalDrivenAgent({ provider: "openai", useLLMPlanner: true });
 * const run = await runner.run({ goal: "Explain quantum computing in 3 steps." });
 * console.log(run.plan.steps, run.outputs);
 * ```
 *
 * @param config - Provider plus optional LLM planner configuration.
 * @returns An {@link AgentRunner} that can generate and execute a plan.
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
