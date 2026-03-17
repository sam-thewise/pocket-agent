import { describe, it, expect } from "vitest";
import { RunStateManager } from "../../src/runner/RunStateManager.js";
import { makeMinimalPlan } from "../helpers/stubs.js";

describe("RunStateManager", () => {
  it("createRun returns state with runId and status planning", () => {
    const m = new RunStateManager();
    const state = m.createRun({ goal: "test" });
    expect(state.runId).toBeDefined();
    expect(state.runId.length).toBeGreaterThan(0);
    expect(state.status).toBe("planning");
  });

  it("setPlan updates currentPlan and initializes step records", () => {
    const m = new RunStateManager();
    m.createRun({ goal: "g" });
    const plan = makeMinimalPlan([
      { id: "s1", outputs: ["o1"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    m.setPlan(plan);
    const state = m.getState();
    expect(state.currentPlan).toBe(plan);
    expect(state.steps["s1"]).toBeDefined();
    expect(state.steps["s1"].status).toBe("pending");
  });

  it("recordStepAttempt appends to step attempts", () => {
    const m = new RunStateManager();
    m.createRun({ goal: "g" });
    const plan = makeMinimalPlan([
      { id: "s1", outputs: ["o1"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    m.setPlan(plan);
    m.recordStepAttempt("s1", {
      stepId: "s1",
      attempt: 1,
      status: "success",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    });
    expect(m.getStepRecord("s1")?.attempts.length).toBe(1);
  });

  it("setFinalOutput sets finalOutput and status completed", () => {
    const m = new RunStateManager();
    m.createRun({ goal: "g" });
    const plan = makeMinimalPlan([
      { id: "s1", outputs: ["o1"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    m.setPlan(plan);
    m.setFinalOutput("s1", { o1: 42 });
    const record = m.getStepRecord("s1");
    expect(record?.finalOutput).toEqual({ o1: 42 });
    expect(record?.status).toBe("completed");
  });

  it("setRunStatus and getState reflect final state", () => {
    const m = new RunStateManager();
    m.createRun({ goal: "g" });
    m.setRunStatus("completed", new Date().toISOString());
    const state = m.getState();
    expect(state.status).toBe("completed");
    expect(state.completedAt).toBeDefined();
  });
});
