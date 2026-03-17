/**
 * Step executor contract input (spec §11).
 */

import type { StepDefinition } from "./plan.js";
import type { StepAttemptResult } from "./step.js";
import type { ToolAdapter } from "./tools.js";
import type { ModelAdapter } from "./models.js";

export interface StepExecutionInput {
  runId: string;
  step: StepDefinition;
  attempt: number;
  resolvedInputs: Record<string, unknown>;
  runContext: Record<string, unknown>;
  tools: Record<string, ToolAdapter>;
  model?: ModelAdapter;
  priorAttempts: StepAttemptResult[];
}
