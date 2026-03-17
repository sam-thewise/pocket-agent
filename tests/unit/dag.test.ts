import { describe, it, expect } from "vitest";
import { getReadySteps, hasCycle, topologicalSort } from "../../src/utils/dag.js";
import type { StepDefinition } from "../../src/types/plan.js";

function step(id: string, deps: string[] = []): StepDefinition {
  return {
    id,
    name: id,
    type: "transform",
    objective: "test",
    dependencies: deps,
    allowedTools: [],
    inputs: [],
    outputs: ["out"],
    completionCriteria: [],
    retryPolicy: { maxAttempts: 1, strategy: "fail" },
  };
}

describe("dag", () => {
  describe("getReadySteps", () => {
    it("returns steps with no deps when none completed", () => {
      const steps = [step("a"), step("b"), step("c", ["a", "b"])];
      const ready = getReadySteps(steps, new Set());
      expect(ready).toContain("a");
      expect(ready).toContain("b");
      expect(ready).not.toContain("c");
      expect(ready.length).toBe(2);
    });

    it("returns dependent step when deps satisfied", () => {
      const steps = [step("a"), step("b", ["a"])];
      const ready = getReadySteps(steps, new Set(["a"]));
      expect(ready).toContain("b");
      expect(ready).toContain("a"); // a has no deps so still "ready" in the sense of all deps satisfied
    });
  });

  describe("hasCycle", () => {
    it("returns false for DAG", () => {
      const steps = [step("a"), step("b", ["a"]), step("c", ["b"])];
      expect(hasCycle(steps)).toBe(false);
    });

    it("returns true for cycle", () => {
      const steps = [step("a", ["c"]), step("b", ["a"]), step("c", ["b"])];
      expect(hasCycle(steps)).toBe(true);
    });
  });

  describe("topologicalSort", () => {
    it("returns order with deps before dependents", () => {
      const steps = [step("c", ["b"]), step("b", ["a"]), step("a")];
      const order = topologicalSort(steps);
      const ai = order.indexOf("a");
      const bi = order.indexOf("b");
      const ci = order.indexOf("c");
      expect(ai).toBeLessThan(bi);
      expect(bi).toBeLessThan(ci);
    });

    it("throws on cycle", () => {
      const steps = [step("a", ["b"]), step("b", ["a"])];
      expect(() => topologicalSort(steps)).toThrow("cycle");
    });
  });
});
