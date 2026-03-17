/**
 * Test helpers: stub planner, executor, evaluator, and minimal plan factory.
 */

import type { Plan, StepDefinition } from "../../src/types/plan.js";
import type { Planner } from "../../src/planner/Planner.js";
import type { StepExecutor } from "../../src/executor/StepExecutor.js";
import type { StepEvaluator } from "../../src/evaluator/StepEvaluator.js";
import type { StepAttemptResult } from "../../src/types/step.js";
import type { EvaluationResult } from "../../src/types/step.js";
import type { PlannerInput, ReplanInput } from "../../src/types/planner.js";
import type { StepExecutionInput } from "../../src/types/executor.js";
import type { StepEvaluationInput } from "../../src/types/evaluator.js";
import { nowISO } from "../../src/utils/time.js";

const defaultRetryPolicy = {
  maxAttempts: 2,
  strategy: "retry_with_feedback" as const,
};

export function makeMinimalPlan(steps: Partial<StepDefinition>[]): Plan {
  return {
    id: "plan-1",
    version: 1,
    goal: "test goal",
    steps: steps.map((s, i) => ({
      id: s.id ?? `step_${i}`,
      name: s.name ?? `Step ${i}`,
      type: s.type ?? "transform",
      objective: s.objective ?? "test",
      dependencies: s.dependencies ?? [],
      allowedTools: s.allowedTools ?? [],
      inputs: s.inputs ?? [],
      outputs: s.outputs ?? ["output"],
      completionCriteria: s.completionCriteria ?? ["done"],
      retryPolicy: s.retryPolicy ?? defaultRetryPolicy,
      ...s,
    })) as StepDefinition[],
    createdAt: nowISO(),
  };
}

export function createStubPlanner(plan: Plan): Planner {
  return {
    async createPlan(_input: PlannerInput): Promise<Plan> {
      return plan;
    },
    async replan(input: ReplanInput): Promise<Plan> {
      return { ...input.currentPlan, version: input.currentPlan.version + 1 };
    },
  };
}

export function createStubExecutor(
  result?: Partial<StepAttemptResult> | ((input: StepExecutionInput) => Partial<StepAttemptResult>)
): StepExecutor {
  return {
    async execute(input: StepExecutionInput): Promise<StepAttemptResult> {
      const base: StepAttemptResult = {
        stepId: input.step.id,
        attempt: input.attempt,
        status: "success",
        structuredOutput: { output: `result-${input.step.id}` },
        startedAt: nowISO(),
        completedAt: nowISO(),
        durationMs: 0,
      };
      const overrides = typeof result === "function" ? result(input) : result ?? {};
      return { ...base, ...overrides };
    },
  };
}

export function createStubEvaluator(
  verdict: EvaluationResult["verdict"] | ((input: StepEvaluationInput) => EvaluationResult["verdict"]) = "complete"
): StepEvaluator {
  return {
    async evaluate(input: StepEvaluationInput): Promise<EvaluationResult> {
      const v = typeof verdict === "function" ? verdict(input) : verdict;
      return {
        stepId: input.step.id,
        attempt: input.attemptResult.attempt,
        verdict: v,
        reasons: v === "complete" ? ["ok"] : ["not ok"],
      };
    },
  };
}
