/**
 * Factory for AgentRunner (spec §23.1).
 */

import type { Planner } from "../planner/Planner.js";
import type { StepExecutor } from "../executor/StepExecutor.js";
import type { StepEvaluator } from "../evaluator/StepEvaluator.js";
import type { ToolAdapter } from "../types/tools.js";
import type { ModelAdapter } from "../types/models.js";
import type { RunOptions } from "../types/run.js";
import { AgentRunner } from "./AgentRunner.js";
import { RunStateManager } from "./RunStateManager.js";
import { EventBus } from "../events/EventBus.js";
import { createLLMEvaluator } from "../adapters/createLLMEvaluator.js";
import { createOpenAIModelAdapter } from "../adapters/models/openai.js";
import { createAnthropicModelAdapter } from "../adapters/models/anthropic.js";
import { createGeminiModelAdapter } from "../adapters/models/gemini.js";
import { createOllamaModelAdapter } from "../adapters/models/ollama.js";
import { createLmStudioModelAdapter } from "../adapters/models/lmstudio.js";
import type { OpenAIModelConfig } from "../adapters/models/openai.js";
import type { AnthropicModelConfig } from "../adapters/models/anthropic.js";
import type { GeminiModelConfig } from "../adapters/models/gemini.js";
import type { OllamaModelConfig } from "../adapters/models/ollama.js";
import type { LmStudioModelConfig } from "../adapters/models/lmstudio.js";

export type ProviderName = "openai" | "anthropic" | "gemini" | "ollama" | "lmstudio";

export interface AgentRunnerConfig {
  planner: Planner;
  executor: StepExecutor;
  /** Required when provider is not set. When provider is set, a default LLM evaluator is used. */
  evaluator?: StepEvaluator;
  tools?: Record<string, ToolAdapter>;
  model?: ModelAdapter;
  defaultOptions?: Partial<RunOptions>;
  /** When set, model and evaluator are created from env/modelConfig; install the matching SDK (openai for openai/ollama/lmstudio). */
  provider?: ProviderName;
  /** Override env-based config for the chosen provider. */
  modelConfig?:
    | OpenAIModelConfig
    | AnthropicModelConfig
    | GeminiModelConfig
    | OllamaModelConfig
    | LmStudioModelConfig;
}

function resolveModelAndEvaluator(config: AgentRunnerConfig): {
  model: ModelAdapter | undefined;
  evaluator: StepEvaluator;
} {
  if (config.evaluator) {
    return { model: config.model, evaluator: config.evaluator };
  }
  if (!config.provider) {
    throw new Error(
      "AgentRunnerConfig: provide either evaluator or provider (openai | anthropic | gemini | ollama | lmstudio). Install the SDK for your provider (e.g. npm install openai)."
    );
  }
  const modelConfig = config.modelConfig ?? {};
  let model: ModelAdapter;
  switch (config.provider) {
    case "openai":
      model = createOpenAIModelAdapter(modelConfig as OpenAIModelConfig);
      break;
    case "anthropic":
      model = createAnthropicModelAdapter(modelConfig as AnthropicModelConfig);
      break;
    case "gemini":
      model = createGeminiModelAdapter(modelConfig as GeminiModelConfig);
      break;
    case "ollama":
      model = createOllamaModelAdapter(modelConfig as OllamaModelConfig);
      break;
    case "lmstudio":
      model = createLmStudioModelAdapter(modelConfig as LmStudioModelConfig);
      break;
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
  const evaluator = createLLMEvaluator(model);
  return { model, evaluator };
}

export function createAgentRunner(config: AgentRunnerConfig): AgentRunner {
  const { model, evaluator } = resolveModelAndEvaluator(config);
  const stateManager = new RunStateManager();
  const eventBus = new EventBus();
  return new AgentRunner(
    {
      planner: config.planner,
      executor: config.executor,
      evaluator,
      tools: config.tools,
      model,
      defaultOptions: config.defaultOptions,
    },
    stateManager,
    eventBus
  );
}

export type { AgentRunner };
