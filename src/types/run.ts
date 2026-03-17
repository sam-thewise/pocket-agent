/**
 * Run task input, options, result, and state (spec §9.1, 9.2, 9.11, 15.1).
 */

import type { Plan } from "./plan.js";
import type { ArtifactRef, StepRunRecord } from "./step.js";

export interface RunOptions {
  maxStepAttempts: number;
  maxPlanRevisions: number;
  maxTotalSteps: number;
  maxExecutionTimeMs: number;
  maxParallelSteps: number;
  requireStructuredOutputs: boolean;
  stopOnStepFailure: boolean;
}

/** v1 defaults from spec §26 */
export const DEFAULT_RUN_OPTIONS: RunOptions = {
  maxStepAttempts: 3,
  maxPlanRevisions: 2,
  maxTotalSteps: 100,
  maxExecutionTimeMs: 300_000,
  maxParallelSteps: 1,
  requireStructuredOutputs: true,
  stopOnStepFailure: true,
};

export interface RunTaskInput {
  goal: string;
  context?: Record<string, unknown>;
  constraints?: string[];
  metadata?: Record<string, unknown>;
  options?: Partial<RunOptions>;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed" | "partial";
  plan: Plan;
  steps: Record<string, StepRunRecord>;
  outputs: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export type RunStatus =
  | "planning"
  | "running"
  | "completed"
  | "failed"
  | "partial";

export interface RunState {
  runId: string;
  status: RunStatus;
  task: RunTaskInput;
  options: RunOptions;
  currentPlan: Plan;
  planHistory: Plan[];
  steps: Record<string, StepRunRecord>;
  outputs: Record<string, unknown>;
  artifacts: Record<string, ArtifactRef>;
  startedAt: string;
  completedAt?: string;
}
