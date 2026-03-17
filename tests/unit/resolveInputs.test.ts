import { describe, it, expect } from "vitest";
import { resolveInputs } from "../../src/runner/resolveInputs.js";
import type { StepRunRecord } from "../../src/types/step.js";
import type { StepInputRef } from "../../src/types/plan.js";

function record(finalOutput: Record<string, unknown>): StepRunRecord {
  return {
    step: {
      id: "s1",
      name: "S1",
      type: "transform",
      objective: "",
      dependencies: [],
      allowedTools: [],
      inputs: [],
      outputs: Object.keys(finalOutput),
      completionCriteria: [],
      retryPolicy: { maxAttempts: 1, strategy: "fail" },
    },
    status: "completed",
    attempts: [],
    finalOutput,
  };
}

describe("resolveInputs", () => {
  it("resolves runContext and stepOutput refs", () => {
    const inputs: StepInputRef[] = [
      { source: "runContext", key: "customerId" },
      { source: "stepOutput", stepId: "s1", key: "file" },
    ];
    const runContext = { customerId: "abc123" };
    const steps: Record<string, StepRunRecord> = {
      s1: record({ file: "doc.txt" }),
    };
    const resolved = resolveInputs(inputs, runContext, steps);
    expect(resolved.customerId).toBe("abc123");
    expect(resolved.file).toBe("doc.txt");
  });

  it("missing step output yields undefined for key", () => {
    const inputs: StepInputRef[] = [{ source: "stepOutput", stepId: "missing", key: "x" }];
    const resolved = resolveInputs(inputs, {}, {});
    expect(resolved.x).toBeUndefined();
  });
});
