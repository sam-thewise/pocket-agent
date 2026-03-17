/**
 * Plan and step definition types (spec §9.3–9.6).
 */

export type StepType = "tool" | "transform" | "decision" | "validation";

export type JsonSchemaLike = Record<string, unknown>;

export interface StepInputRef {
  source: "runContext" | "stepOutput" | "artifact";
  key: string;
  stepId?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  strategy: "retry_with_feedback" | "replan" | "fail";
  backoffMs?: number;
}

export interface StepDefinition {
  id: string;
  name: string;
  type: StepType;
  objective: string;
  dependencies: string[];
  allowedTools: string[];
  inputs: StepInputRef[];
  outputSchema?: JsonSchemaLike;
  outputs: string[];
  completionCriteria: string[];
  retryPolicy: RetryPolicy;
  executionMode?: "sequential" | "parallelizable";
}

export interface Plan {
  id: string;
  version: number;
  goal: string;
  steps: StepDefinition[];
  createdAt: string;
}
