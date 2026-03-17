import { describe, it, expect } from "vitest";
import { createDefaultExecutor } from "../../src/defaults/defaultExecutor.js";
import { makeMinimalPlan } from "../helpers/stubs.js";
import type { StepExecutionInput } from "../../src/types/executor.js";

function createMockModel(content: string) {
  return {
    generate: async () => ({ content }),
  };
}

describe("defaultExecutor", () => {
  it("calls model and maps output to step output key", async () => {
    const model = createMockModel("The result text.");
    const executor = createDefaultExecutor({ model });
    const input: StepExecutionInput = {
      runId: "r1",
      step: makeMinimalPlan([{ id: "s1", outputs: ["myKey"] }]).steps[0],
      attempt: 1,
      resolvedInputs: { goal: "Do something" },
      runContext: {},
      tools: {},
      priorAttempts: [],
    };
    const result = await executor.execute(input);
    expect(result.stepId).toBe("s1");
    expect(result.attempt).toBe(1);
    expect(result.status).toBe("success");
    expect(result.structuredOutput).toEqual({ myKey: "The result text." });
    expect(result.rawOutput).toBe("The result text.");
    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("includes systemPrompt in prompt", async () => {
    let capturedPrompt = "";
    const model = {
      generate: async (opts: { prompt?: string }) => {
        capturedPrompt = opts.prompt ?? "";
        return { content: "ok" };
      },
    };
    const executor = createDefaultExecutor({ model, systemPrompt: "Be brief." });
    const input: StepExecutionInput = {
      runId: "r1",
      step: makeMinimalPlan([{ id: "s1", name: "Step", objective: "Do it", outputs: ["out"] }]).steps[0],
      attempt: 1,
      resolvedInputs: {},
      runContext: {},
      tools: {},
      priorAttempts: [],
    };
    await executor.execute(input);
    expect(capturedPrompt).toContain("Be brief.");
    expect(capturedPrompt).toContain("Step");
    expect(capturedPrompt).toContain("Do it");
    expect(capturedPrompt).toContain("out");
  });

  it("returns error result when model throws", async () => {
    const model = {
      generate: async () => {
        throw new Error("Model failed");
      },
    };
    const executor = createDefaultExecutor({ model });
    const input: StepExecutionInput = {
      runId: "r1",
      step: makeMinimalPlan([{ id: "s1", outputs: ["out"] }]).steps[0],
      attempt: 1,
      resolvedInputs: {},
      runContext: {},
      tools: {},
      priorAttempts: [],
    };
    const result = await executor.execute(input);
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("EXEC_ERROR");
    expect(result.error?.message).toContain("Model failed");
  });

  it("uses default output key when step has no outputs", async () => {
    const model = createMockModel("content");
    const executor = createDefaultExecutor({ model });
    const stepDef = makeMinimalPlan([{ id: "s1", outputs: [] }]).steps[0];
    stepDef.outputs = [];
    const input: StepExecutionInput = {
      runId: "r1",
      step: stepDef,
      attempt: 1,
      resolvedInputs: {},
      runContext: {},
      tools: {},
      priorAttempts: [],
    };
    const result = await executor.execute(input);
    expect(result.status).toBe("success");
    expect(result.structuredOutput).toHaveProperty("output", "content");
  });
});
