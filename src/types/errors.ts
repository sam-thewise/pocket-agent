/**
 * Typed failure errors (spec §17).
 */

export class PlanningFailureError extends Error {
  readonly code = "PLANNING_FAILURE";
  readonly errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = "PlanningFailureError";
    this.errors = errors;
  }
}

export class ExecutionFailureError extends Error {
  readonly code = "EXECUTION_FAILURE";
  readonly stepId?: string;
  readonly details?: unknown;

  constructor(message: string, options?: { stepId?: string; details?: unknown }) {
    super(message);
    this.name = "ExecutionFailureError";
    this.stepId = options?.stepId;
    this.details = options?.details;
  }
}

export class EvaluationFailureError extends Error {
  readonly code = "EVALUATION_FAILURE";
  readonly stepId?: string;

  constructor(message: string, stepId?: string) {
    super(message);
    this.name = "EvaluationFailureError";
    this.stepId = stepId;
  }
}

export class RunFailureError extends Error {
  readonly code = "RUN_FAILURE";
  readonly runId?: string;

  constructor(message: string, runId?: string) {
    super(message);
    this.name = "RunFailureError";
    this.runId = runId;
  }
}
