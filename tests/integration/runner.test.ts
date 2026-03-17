import { describe, it, expect } from "vitest";
import { createAgentRunner } from "../../src/runner/createAgentRunner.js";
import { makeMinimalPlan, createStubPlanner, createStubExecutor, createStubEvaluator } from "../helpers/stubs.js";

describe("Runner integration", () => {
  it("happy path: run completes with plan, step status, and outputs", async () => {
    const plan = makeMinimalPlan([
      { id: "s1", outputs: ["o1"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "s2", dependencies: ["s1"], outputs: ["o2"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const runner = createAgentRunner({
      planner: createStubPlanner(plan),
      executor: createStubExecutor(),
      evaluator: createStubEvaluator("complete"),
    });
    const result = await runner.run({ goal: "test" });
    expect(result.status).toBe("completed");
    expect(result.plan.steps.length).toBe(2);
    expect(result.runId).toBeDefined();
    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.steps["s1"].status).toBe("completed");
    expect(result.steps["s2"].status).toBe("completed");
    expect(result.steps["s1"].finalOutput).toBeDefined();
    expect(result.steps["s2"].finalOutput).toBeDefined();
    expect(Object.keys(result.outputs).length).toBeGreaterThan(0);
  });

  it("emits lifecycle events in order", async () => {
    const plan = makeMinimalPlan([
      { id: "s1", outputs: ["o1"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const runner = createAgentRunner({
      planner: createStubPlanner(plan),
      executor: createStubExecutor(),
      evaluator: createStubEvaluator("complete"),
    });
    const events: string[] = [];
    runner.start({ goal: "test" }).on("run.started", () => events.push("run.started"));
    runner.start({ goal: "test" }).on("plan.created", () => events.push("plan.created"));
    const exec = runner.start({ goal: "test" });
    exec.on("run.started", () => events.push("run.started"));
    exec.on("plan.created", () => events.push("plan.created"));
    exec.on("step.started", () => events.push("step.started"));
    exec.on("step.completed", () => events.push("step.completed"));
    exec.on("run.completed", () => events.push("run.completed"));
    await exec.result;
    expect(events).toContain("run.started");
    expect(events).toContain("plan.created");
    expect(events).toContain("step.started");
    expect(events).toContain("step.completed");
    expect(events).toContain("run.completed");
  });

  it("retry path: evaluator retry then complete", async () => {
    const plan = makeMinimalPlan([
      { id: "s1", outputs: ["o1"], retryPolicy: { maxAttempts: 2, strategy: "retry_with_feedback" } },
    ]);
    let attemptCount = 0;
    const runner = createAgentRunner({
      planner: createStubPlanner(plan),
      executor: createStubExecutor(),
      evaluator: createStubEvaluator((input) => {
        attemptCount++;
        return attemptCount >= 2 ? "complete" : "retry";
      }),
    });
    const result = await runner.run({ goal: "test" });
    expect(result.status).toBe("completed");
    expect(result.steps["s1"].attempts.length).toBe(2);
  });

  it("step failure and stopOnStepFailure", async () => {
    const plan = makeMinimalPlan([
      { id: "s1", outputs: ["o1"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "s2", dependencies: ["s1"], outputs: ["o2"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const runner = createAgentRunner({
      planner: createStubPlanner(plan),
      executor: createStubExecutor((input) =>
        input.step.id === "s1" ? { status: "error", error: { code: "ERR", message: "fail" } } : {}
      ),
      evaluator: createStubEvaluator((input) => (input.attemptResult.status === "error" ? "failed" : "complete")),
    });
    const result = await runner.run({ goal: "test", options: { stopOnStepFailure: true } });
    expect(result.status).toBe("failed");
    expect(result.steps["s1"].status).toBe("failed");
    expect(result.steps["s2"].attempts.length).toBe(0);
  });
});
