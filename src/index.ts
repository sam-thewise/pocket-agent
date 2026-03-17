/**
 * pocket-agent — Reusable Node.js framework for plan-driven agent execution.
 * @author sam_thewise
 */

export { createAgentRunner } from "./runner/createAgentRunner.js";
export type {
  AgentRunner,
  AgentRunnerConfig,
  ProviderName,
} from "./runner/createAgentRunner.js";
export type { RunningExecution } from "./runner/RunningExecution.js";

export { createQuickAgent, createGoalDrivenAgent } from "./quickStart.js";
export type { QuickAgentConfig, GoalDrivenAgentConfig } from "./quickStart.js";
export { createLLMPlanner } from "./defaults/llmPlanner.js";
export type { LLMPlannerOptions } from "./defaults/llmPlanner.js";

export { step, buildPlan } from "./defaults/planBuilder.js";
export type { StepBuilderOptions, BuildPlanOptions } from "./defaults/planBuilder.js";
export { createSingleStepPlanner, createFixedPlanPlanner } from "./defaults/singleStepPlanner.js";
export { createDefaultExecutor } from "./defaults/defaultExecutor.js";
export type { DefaultExecutorOptions } from "./defaults/defaultExecutor.js";

export { createLLMEvaluator } from "./adapters/createLLMEvaluator.js";
export type { LLMEvaluatorOptions } from "./adapters/createLLMEvaluator.js";
export { createOpenAIModelAdapter } from "./adapters/models/openai.js";
export type { OpenAIModelConfig } from "./adapters/models/openai.js";
export { createAnthropicModelAdapter } from "./adapters/models/anthropic.js";
export type { AnthropicModelConfig } from "./adapters/models/anthropic.js";
export { createGeminiModelAdapter } from "./adapters/models/gemini.js";
export type { GeminiModelConfig } from "./adapters/models/gemini.js";
export { createOllamaModelAdapter } from "./adapters/models/ollama.js";
export type { OllamaModelConfig } from "./adapters/models/ollama.js";
export {
  ollamaStreamingChat,
  getOllamaBaseUrl,
} from "./adapters/models/ollamaStreaming.js";
export type {
  OllamaStreamingOptions,
  OllamaStreamingResult,
} from "./adapters/models/ollamaStreaming.js";
export { createLmStudioModelAdapter } from "./adapters/models/lmstudio.js";
export type { LmStudioModelConfig } from "./adapters/models/lmstudio.js";
export {
  lmStudioStreamingChat,
  getLMStudioBaseUrl,
} from "./adapters/models/lmStudioStreaming.js";
export type {
  LMStudioStreamingOptions,
  LMStudioStreamingResult,
} from "./adapters/models/lmStudioStreaming.js";

export type {
  RunTaskInput,
  RunOptions,
  RunResult,
  RunState,
  RunStatus,
} from "./types/run.js";
export { DEFAULT_RUN_OPTIONS } from "./types/run.js";
export type {
  Plan,
  StepDefinition,
  StepType,
  StepInputRef,
  RetryPolicy,
  JsonSchemaLike,
} from "./types/plan.js";
export type {
  StepStatus,
  StepAttemptResult,
  StepRunRecord,
  EvaluationVerdict,
  EvaluationResult,
  ArtifactRef,
  EvidenceRef,
  StepExecutionError,
} from "./types/step.js";
export type {
  PlannerInput,
  ReplanInput,
} from "./types/planner.js";
export type {
  StepExecutionInput,
} from "./types/executor.js";
export type {
  StepEvaluationInput,
} from "./types/evaluator.js";
export type { ToolDefinition, ToolAdapter, ToolInvocationContext } from "./types/tools.js";
export type { ModelAdapter, ModelGenerateInput, ModelGenerateOutput } from "./types/models.js";
export type {
  AgentRunnerEvent,
  EventName,
  RunStartedEvent,
  PlanCreatedEvent,
  PlanRevisedEvent,
  StepReadyEvent,
  StepStartedEvent,
  StepRetryingEvent,
  StepCompletedEvent,
  StepBlockedEvent,
  StepFailedEvent,
  RunCompletedEvent,
  RunFailedEvent,
} from "./types/events.js";
export { EVENT_NAMES } from "./types/events.js";
export {
  PlanningFailureError,
  ExecutionFailureError,
  EvaluationFailureError,
  RunFailureError,
} from "./types/errors.js";

export type { Planner } from "./planner/Planner.js";
export type { StepExecutor } from "./executor/StepExecutor.js";
export type { StepEvaluator } from "./evaluator/StepEvaluator.js";
