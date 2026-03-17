import { describe, it, expect } from "vitest";
import { getReadyStepIds } from "../../src/runner/StepScheduler.js";
import { makeMinimalPlan } from "../helpers/stubs.js";
import type { StepRunRecord } from "../../src/types/step.js";
import { DEFAULT_RUN_OPTIONS } from "../../src/types/run.js";

function record(stepId: string, status: StepRunRecord["status"], step = { id: stepId, name: stepId, type: "transform" as const, objective: "", dependencies: [] as string[], allowedTools: [], inputs: [], outputs: ["out"], completionCriteria: [], retryPolicy: { maxAttempts: 1, strategy: "fail" as const } }): StepRunRecord {
  return {
    step: step as StepRunRecord["step"],
    status,
    attempts: [],
  };
}

describe("StepScheduler", () => {
  it("returns root step when no steps completed", () => {
    const plan = makeMinimalPlan([
      { id: "root", outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "child", dependencies: ["root"], outputs: ["y"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const records: Record<string, StepRunRecord> = {
      root: record("root", "pending", plan.steps[0]),
      child: record("child", "pending", plan.steps[1]),
    };
    const ready = getReadyStepIds(plan, records, DEFAULT_RUN_OPTIONS);
    expect(ready).toContain("root");
    expect(ready).not.toContain("child");
  });

  it("returns dependent step after root completed", () => {
    const plan = makeMinimalPlan([
      { id: "root", outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "child", dependencies: ["root"], outputs: ["y"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const records: Record<string, StepRunRecord> = {
      root: record("root", "completed", plan.steps[0]),
      child: record("child", "pending", plan.steps[1]),
    };
    const ready = getReadyStepIds(plan, records, DEFAULT_RUN_OPTIONS);
    expect(ready).toContain("child");
  });

  it("does not return running or completed steps", () => {
    const plan = makeMinimalPlan([
      { id: "a", outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const records: Record<string, StepRunRecord> = {
      a: record("a", "running", plan.steps[0]),
    };
    const ready = getReadyStepIds(plan, records, DEFAULT_RUN_OPTIONS);
    expect(ready).not.toContain("a");
  });

  it("with maxParallelSteps 2 returns up to two independent ready steps", () => {
    const plan = makeMinimalPlan([
      { id: "a", outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "b", outputs: ["y"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const records: Record<string, StepRunRecord> = {
      a: record("a", "pending", plan.steps[0]),
      b: record("b", "pending", plan.steps[1]),
    };
    const ready = getReadyStepIds(plan, records, { ...DEFAULT_RUN_OPTIONS, maxParallelSteps: 2 });
    expect(ready.length).toBe(2);
    expect(ready).toContain("a");
    expect(ready).toContain("b");
  });
});
