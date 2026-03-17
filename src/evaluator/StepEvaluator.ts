/**
 * Step evaluator contract (spec §12).
 */

import type { EvaluationResult } from "../types/step.js";
import type { StepEvaluationInput } from "../types/evaluator.js";

export interface StepEvaluator {
  evaluate(input: StepEvaluationInput): Promise<EvaluationResult>;
}
