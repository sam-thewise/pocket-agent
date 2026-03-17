/**
 * Step evaluator contract input (spec §12).
 */

import type { StepDefinition } from "./plan.js";
import type { StepAttemptResult } from "./step.js";
import type { EvaluationResult } from "./step.js";

export interface StepEvaluationInput {
  runId: string;
  step: StepDefinition;
  attemptResult: StepAttemptResult;
  priorAttempts: StepAttemptResult[];
}

export type { EvaluationResult };
