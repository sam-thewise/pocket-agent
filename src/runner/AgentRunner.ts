/**
 * Top-level orchestrator (spec §6.1, §7).
 */

import type { RunTaskInput, RunResult, RunOptions } from "../types/run.js";
import type { Planner } from "../planner/Planner.js";
import type { StepExecutor } from "../executor/StepExecutor.js";
import type { StepEvaluator } from "../evaluator/StepEvaluator.js";
import type { ToolAdapter } from "../types/tools.js";
import type { ModelAdapter } from "../types/models.js";
import type { StepAttemptResult } from "../types/step.js";
import { DEFAULT_RUN_OPTIONS } from "../types/run.js";
import { assertValidPlan } from "../planner/PlanValidator.js";
import { getReadyStepIds } from "./StepScheduler.js";
import { resolveInputs } from "./resolveInputs.js";
import { RunStateManager } from "./RunStateManager.js";
import { EventBus } from "../events/EventBus.js";
import { nowISO } from "../utils/time.js";
import { durationMs } from "../utils/time.js";
import { RunFailureError } from "../types/errors.js";

function mergeOptions(overrides?: Partial<RunOptions>): RunOptions {
  return { ...DEFAULT_RUN_OPTIONS, ...overrides };
}

function toRunResult(state: ReturnType<RunStateManager["getState"]>): RunResult {
  const completedAt = state.completedAt ?? nowISO();
  const status: RunResult["status"] =
    state.status === "completed" || state.status === "failed" || state.status === "partial"
      ? state.status
      : "failed";
  return {
    runId: state.runId,
    status,
    plan: state.currentPlan,
    steps: { ...state.steps },
    outputs: { ...state.outputs },
    startedAt: state.startedAt,
    completedAt,
    durationMs: durationMs(state.startedAt, completedAt),
  };
}

export interface AgentRunnerDeps {
  planner: Planner;
  executor: StepExecutor;
  evaluator: StepEvaluator;
  tools?: Record<string, ToolAdapter>;
  model?: ModelAdapter;
  defaultOptions?: Partial<RunOptions>;
}

export class AgentRunner {
  constructor(
    private deps: AgentRunnerDeps,
    private stateManager: RunStateManager,
    private eventBus: EventBus
  ) {}

  start(input: RunTaskInput): import("./RunningExecution.js").RunningExecution {
    this.stateManager.createRun(input, input.options ?? this.deps.defaultOptions);
    const runId = this.stateManager.getState().runId;
    const result = this.runLoop(input, true);
    return {
      runId,
      result,
      on: (eventName, handler) => this.eventBus.on(eventName, handler as (e: import("../types/events.js").AgentRunnerEvent) => void),
      getState: () => this.stateManager.getState(),
    };
  }

  async run(input: RunTaskInput): Promise<RunResult> {
    return this.runLoop(input, false);
  }

  private async runLoop(input: RunTaskInput, skipCreateRun: boolean): Promise<RunResult> {
    const options = mergeOptions(input.options ?? this.deps.defaultOptions);
    const tools = this.deps.tools ?? {};
    const context = input.context ?? {};

    if (!skipCreateRun) {
      this.stateManager.createRun(input, options);
    }
    const state = this.stateManager.getState();
    this.eventBus.emit("run.started", { runId: state.runId });

    // Planning
    const plan = await this.deps.planner.createPlan({
      goal: input.goal,
      context: context as Record<string, unknown>,
      constraints: input.constraints ?? [],
      availableTools: Object.values(tools).map((t) => t.definition),
      options,
    });
    assertValidPlan(plan);
    this.stateManager.setPlan(plan);
    this.eventBus.emit("plan.created", { runId: state.runId, plan });

    this.stateManager.setRunStatus("running");
    let planRevisions = 0;
    const startTime = Date.now();

    // Execution loop
    while (true) {
      const currentState = this.stateManager.getState();
      if (currentState.status === "failed" || currentState.status === "completed" || currentState.status === "partial") {
        break;
      }

      if (Date.now() - startTime > options.maxExecutionTimeMs) {
        this.stateManager.setRunStatus("failed", nowISO());
        this.eventBus.emit("run.failed", { runId: state.runId, error: new RunFailureError("maxExecutionTimeMs exceeded", state.runId) });
        break;
      }

      const totalStepsExecuted = Object.values(currentState.steps).reduce(
        (n, r) => n + r.attempts.length,
        0
      );
      if (totalStepsExecuted >= options.maxTotalSteps) {
        this.stateManager.setRunStatus("failed", nowISO());
        this.eventBus.emit("run.failed", { runId: state.runId, error: new RunFailureError("maxTotalSteps exceeded", state.runId) });
        break;
      }

      const readyIds = getReadyStepIds(currentState.currentPlan, currentState.steps, options);
      if (readyIds.length === 0) {
        const allTerminal = currentState.currentPlan.steps.every((s) => {
          const r = currentState.steps[s.id];
          return r && (r.status === "completed" || r.status === "failed" || r.status === "blocked" || r.status === "skipped");
        });
        if (allTerminal) {
          const anyFailed = currentState.currentPlan.steps.some((s) => currentState.steps[s.id]?.status === "failed");
          this.stateManager.setRunStatus(anyFailed ? "failed" : "completed", nowISO());
          this.eventBus.emit(
            anyFailed ? "run.failed" : "run.completed",
            anyFailed ? { runId: state.runId, timestamp: nowISO() } : { runId: state.runId, outputs: currentState.outputs, timestamp: nowISO() }
          );
        } else {
          this.stateManager.setRunStatus("partial", nowISO());
          this.eventBus.emit("run.failed", { runId: state.runId, timestamp: nowISO() });
        }
        break;
      }

      for (const stepId of readyIds) {
        const stepRecord = this.stateManager.getStepRecord(stepId)!;
        const step = stepRecord.step;
        const attempt = stepRecord.attempts.length + 1;

        if (attempt > options.maxStepAttempts) {
          this.stateManager.setStepStatus(stepId, "failed");
          this.eventBus.emit("step.failed", { runId: state.runId, stepId, attempt: attempt - 1, timestamp: nowISO() });
          if (options.stopOnStepFailure) {
            this.stateManager.setRunStatus("failed", nowISO());
            this.eventBus.emit("run.failed", { runId: state.runId, timestamp: nowISO() });
            return toRunResult(this.stateManager.getState());
          }
          continue;
        }

        this.stateManager.setStepStatus(stepId, attempt > 1 ? "retrying" : "running");
        this.eventBus.emit("step.started", { runId: state.runId, stepId, attempt, timestamp: nowISO() });
        if (attempt > 1) {
          this.eventBus.emit("step.retrying", { runId: state.runId, stepId, attempt, timestamp: nowISO() });
        }

        const resolvedInputs = resolveInputs(
          step.inputs,
          context as Record<string, unknown>,
          this.stateManager.getState().steps
        );

        let attemptResult: StepAttemptResult;
        try {
          attemptResult = await this.deps.executor.execute({
            runId: state.runId,
            step,
            attempt,
            resolvedInputs,
            runContext: context as Record<string, unknown>,
            tools,
            model: this.deps.model,
            priorAttempts: stepRecord.attempts,
          });
        } catch (err) {
          attemptResult = {
            stepId,
            attempt,
            status: "error",
            error: { code: "EXECUTION_ERROR", message: String(err), details: err },
            startedAt: nowISO(),
            completedAt: nowISO(),
            durationMs: 0,
          };
        }

        this.stateManager.recordStepAttempt(stepId, attemptResult);

        const evaluation = await this.deps.evaluator.evaluate({
          runId: state.runId,
          step,
          attemptResult,
          priorAttempts: stepRecord.attempts,
        });
        this.stateManager.setStepEvaluation(stepId, evaluation);

        if (evaluation.verdict === "complete") {
          const output = attemptResult.structuredOutput ?? (attemptResult.rawOutput as Record<string, unknown>) ?? {};
          this.stateManager.setFinalOutput(stepId, output, attemptResult.artifacts);
          this.stateManager.setRunOutputs(output);
          this.eventBus.emit("step.completed", {
            runId: state.runId,
            stepId,
            attempt,
            outputs: output,
            timestamp: nowISO(),
          });
          continue;
        }

        if (evaluation.verdict === "retry") {
          if (attempt < step.retryPolicy.maxAttempts && attempt < options.maxStepAttempts) {
            this.stateManager.setStepStatus(stepId, "ready");
            break; // re-enter main loop to re-pick this step
          }
          this.stateManager.setStepStatus(stepId, "failed");
          this.eventBus.emit("step.failed", { runId: state.runId, stepId, attempt, error: evaluation.reasons, timestamp: nowISO() });
          if (options.stopOnStepFailure) {
            this.stateManager.setRunStatus("failed", nowISO());
            this.eventBus.emit("run.failed", { runId: state.runId, timestamp: nowISO() });
            return toRunResult(this.stateManager.getState());
          }
          continue;
        }

        if (evaluation.verdict === "needs_replan") {
          if (planRevisions >= options.maxPlanRevisions) {
            this.stateManager.setStepStatus(stepId, "failed");
            this.stateManager.setRunStatus("failed", nowISO());
            this.eventBus.emit("run.failed", { runId: state.runId, timestamp: nowISO() });
            return toRunResult(this.stateManager.getState());
          }
          const newPlan = await this.deps.planner.replan({
            runId: state.runId,
            goal: input.goal,
            context: context as Record<string, unknown>,
            constraints: input.constraints ?? [],
            currentPlan: this.stateManager.getState().currentPlan,
            failedStepId: stepId,
            availableTools: Object.values(tools).map((t) => t.definition),
            options,
          });
          assertValidPlan(newPlan);
          this.stateManager.appendPlanHistory(this.stateManager.getState().currentPlan);
          this.stateManager.setPlan(newPlan);
          planRevisions++;
          this.eventBus.emit("plan.revised", { runId: state.runId, plan: newPlan, timestamp: nowISO() });
          break; // re-enter loop to get new ready steps
        }

        // failed
        this.stateManager.setStepStatus(stepId, "failed");
        this.eventBus.emit("step.failed", { runId: state.runId, stepId, attempt, error: evaluation.reasons, timestamp: nowISO() });
        if (options.stopOnStepFailure) {
          this.stateManager.setRunStatus("failed", nowISO());
          this.eventBus.emit("run.failed", { runId: state.runId, timestamp: nowISO() });
          return toRunResult(this.stateManager.getState());
        }
      }
    }

    return toRunResult(this.stateManager.getState());
  }
}
