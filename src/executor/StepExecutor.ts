/**
 * Step executor contract (spec §11).
 */

import type { StepAttemptResult } from "../types/step.js";
import type { StepExecutionInput } from "../types/executor.js";

export interface StepExecutor {
  execute(input: StepExecutionInput): Promise<StepAttemptResult>;
}
