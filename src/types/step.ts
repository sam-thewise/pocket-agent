/**
 * Step execution and evaluation types (spec §9.7–9.10).
 */

import type { StepDefinition } from "./plan.js";

export type StepStatus =
  | "pending"
  | "ready"
  | "running"
  | "retrying"
  | "completed"
  | "blocked"
  | "failed"
  | "skipped";

export interface ArtifactRef {
  id: string;
  type?: string;
  [key: string]: unknown;
}

export interface EvidenceRef {
  type?: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface StepExecutionError {
  code: string;
  message: string;
  details?: unknown;
}

export interface StepAttemptResult {
  stepId: string;
  attempt: number;
  status: "success" | "error";
  rawOutput?: unknown;
  structuredOutput?: Record<string, unknown>;
  artifacts?: ArtifactRef[];
  evidence?: EvidenceRef[];
  error?: StepExecutionError;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export type EvaluationVerdict = "complete" | "retry" | "needs_replan" | "failed";

export interface EvaluationResult {
  stepId: string;
  attempt: number;
  verdict: EvaluationVerdict;
  reasons: string[];
  missingCriteria?: string[];
  confidence?: number;
  suggestedAction?: string;
}

export interface StepRunRecord {
  step: StepDefinition;
  status: StepStatus;
  attempts: StepAttemptResult[];
  latestEvaluation?: EvaluationResult;
  finalOutput?: Record<string, unknown>;
  finalArtifacts?: ArtifactRef[];
}
