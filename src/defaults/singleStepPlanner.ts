/**
 * Default planner that always produces a single step: "answer the goal".
 * Useful for quick starts and simple QA flows.
 */

import type { Plan, StepDefinition } from "../types/plan.js";
import type { Planner } from "../planner/Planner.js";
import type { PlannerInput, ReplanInput } from "../types/planner.js";
import { buildPlan } from "./planBuilder.js";

const SINGLE_STEP: StepDefinition = {
  id: "answer",
  name: "Answer",
  type: "transform",
  objective: "Answer the user's goal or question clearly and completely.",
  dependencies: [],
  allowedTools: [],
  inputs: [{ source: "runContext", key: "goal" }],
  outputs: ["answer"],
  completionCriteria: ["A clear answer is produced."],
  retryPolicy: { maxAttempts: 2, strategy: "retry_with_feedback" },
};

/**
 * Creates a planner that always returns a one-step plan: a single "answer" step that
 * uses the run context goal. Ideal for quick starts and simple question-answering.
 */
export function createSingleStepPlanner(): Planner {
  return {
    async createPlan(input: PlannerInput): Promise<Plan> {
      return buildPlan(input.goal, [SINGLE_STEP]);
    },
    async replan(input: ReplanInput): Promise<Plan> {
      return buildPlan(input.goal, [SINGLE_STEP], {
        planId: input.currentPlan.id,
        version: input.currentPlan.version + 1,
      });
    },
  };
}

/**
 * Creates a planner that always returns the given plan (goal is taken from input at createPlan time).
 * Use with buildPlan(goal, steps) so the goal stays in sync, or pass a plan built once.
 */
export function createFixedPlanPlanner(fixedSteps: StepDefinition[]): Planner {
  return {
    async createPlan(input: PlannerInput): Promise<Plan> {
      return buildPlan(input.goal, fixedSteps);
    },
    async replan(input: ReplanInput): Promise<Plan> {
      return buildPlan(input.goal, fixedSteps, {
        planId: input.currentPlan.id,
        version: input.currentPlan.version + 1,
      });
    },
  };
}
