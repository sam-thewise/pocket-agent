/**
 * Plan validation (spec §10). Validates before execution.
 */

import type { Plan } from "../types/plan.js";
import { hasCycle } from "../utils/dag.js";
import { PlanningFailureError } from "../types/errors.js";

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export function validatePlan(plan: Plan): ValidationResult {
  const errors: string[] = [];
  const steps = plan.steps ?? [];
  const stepIds = new Set<string>();

  for (const step of steps) {
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);

    if (!step.outputs || step.outputs.length === 0) {
      errors.push(`Step ${step.id}: outputs must be declared`);
    }
    if (!step.retryPolicy) {
      errors.push(`Step ${step.id}: retryPolicy must be present`);
    }

    for (const depId of step.dependencies ?? []) {
      if (!stepIds.has(depId)) {
        errors.push(`Step ${step.id}: dependency "${depId}" is not a valid step id`);
      }
    }
  }

  if (hasCycle(steps)) {
    errors.push("Plan contains a cycle in step dependencies");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Validates the plan and throws PlanningFailureError if invalid.
 */
export function assertValidPlan(plan: Plan): void {
  const result = validatePlan(plan);
  if (!result.valid) {
    throw new PlanningFailureError(
      `Invalid plan: ${result.errors.join("; ")}`,
      result.errors
    );
  }
}
