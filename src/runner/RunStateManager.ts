/**
 * Run-scoped execution state (spec §15).
 */

import type { RunState, RunStatus, RunTaskInput, RunOptions } from "../types/run.js";
import type { Plan } from "../types/plan.js";
import type { StepRunRecord, StepStatus, StepAttemptResult, EvaluationResult, ArtifactRef } from "../types/step.js";
import { createRunId } from "../utils/ids.js";
import { nowISO } from "../utils/time.js";
import { DEFAULT_RUN_OPTIONS } from "../types/run.js";

function mergeOptions(overrides?: Partial<RunOptions>): RunOptions {
  return { ...DEFAULT_RUN_OPTIONS, ...overrides };
}

function emptyPlan(goal: string): Plan {
  return {
    id: "",
    version: 0,
    goal,
    steps: [],
    createdAt: nowISO(),
  };
}

function createStepRecord(step: Plan["steps"][0]): StepRunRecord {
  return {
    step,
    status: "pending",
    attempts: [],
  };
}

export class RunStateManager {
  private state!: RunState;

  createRun(task: RunTaskInput, options?: Partial<RunOptions>): RunState {
    const runId = createRunId();
    const opts = mergeOptions(task.options ?? options);
    this.state = {
      runId,
      status: "planning",
      task,
      options: opts,
      currentPlan: emptyPlan(task.goal),
      planHistory: [],
      steps: {},
      outputs: {},
      artifacts: {},
      startedAt: nowISO(),
    };
    return this.state;
  }

  setPlan(plan: Plan): void {
    this.state.currentPlan = plan;
    this.state.steps = {};
    for (const s of plan.steps) {
      this.state.steps[s.id] = createStepRecord(s);
    }
  }

  appendPlanHistory(plan: Plan): void {
    this.state.planHistory.push(plan);
  }

  getStepRecord(stepId: string): StepRunRecord | undefined {
    return this.state.steps[stepId];
  }

  recordStepAttempt(stepId: string, attemptResult: StepAttemptResult): void {
    const record = this.state.steps[stepId];
    if (record) {
      record.attempts.push(attemptResult);
    }
  }

  setStepStatus(stepId: string, status: StepStatus): void {
    const record = this.state.steps[stepId];
    if (record) {
      record.status = status;
    }
  }

  setStepEvaluation(stepId: string, evaluation: EvaluationResult): void {
    const record = this.state.steps[stepId];
    if (record) {
      record.latestEvaluation = evaluation;
    }
  }

  setFinalOutput(stepId: string, output: Record<string, unknown>, artifacts?: ArtifactRef[]): void {
    const record = this.state.steps[stepId];
    if (record) {
      record.finalOutput = output;
      record.finalArtifacts = artifacts;
      record.status = "completed";
    }
  }

  setRunOutputs(outputs: Record<string, unknown>): void {
    this.state.outputs = { ...this.state.outputs, ...outputs };
  }

  setRunStatus(status: RunStatus, completedAt?: string): void {
    this.state.status = status;
    if (completedAt) {
      this.state.completedAt = completedAt;
    }
  }

  getState(): RunState {
    return this.state;
  }
}
