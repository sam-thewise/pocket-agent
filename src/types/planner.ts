/**
 * Planner contract input types (spec §10).
 */

import type { Plan } from "./plan.js";
import type { RunOptions } from "./run.js";
import type { ToolDefinition } from "./tools.js";

export interface PlannerInput {
  goal: string;
  context: Record<string, unknown>;
  constraints: string[];
  availableTools: ToolDefinition[];
  options: RunOptions;
}

export interface ReplanInput {
  runId: string;
  goal: string;
  context: Record<string, unknown>;
  constraints: string[];
  currentPlan: Plan;
  failedStepId: string;
  availableTools: ToolDefinition[];
  options: RunOptions;
}
