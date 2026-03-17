import { describe, it, expect } from "vitest";
import { step, buildPlan } from "../../src/defaults/planBuilder.js";

describe("planBuilder", () => {
  describe("step()", () => {
    it("builds a minimal step with id and name", () => {
      const s = step("id_a", "Name A").build();
      expect(s.id).toBe("id_a");
      expect(s.name).toBe("Name A");
      expect(s.type).toBe("transform");
      expect(s.objective).toBe("");
      expect(s.dependencies).toEqual([]);
      expect(s.allowedTools).toEqual([]);
      expect(s.outputs).toEqual(["output"]);
      expect(s.completionCriteria).toEqual(['Output "output" is produced.']);
      expect(s.retryPolicy).toEqual({ maxAttempts: 2, strategy: "retry_with_feedback" });
    });

    it("chains objective and outputs", () => {
      const s = step("x", "X")
        .objective("Do X.")
        .outputs("result")
        .build();
      expect(s.objective).toBe("Do X.");
      expect(s.outputs).toEqual(["result"]);
      expect(s.completionCriteria).toEqual(['Output "result" is produced.']);
    });

    it("supports multiple outputs and custom completionCriteria", () => {
      const s = step("m", "M")
        .outputs("a", "b")
        .completionCriteria("A done", "B done")
        .build();
      expect(s.outputs).toEqual(["a", "b"]);
      expect(s.completionCriteria).toEqual(["A done", "B done"]);
    });

    it("builds inputsFromContext", () => {
      const s = step("c", "C")
        .inputsFromContext("goal", "customerId")
        .build();
      expect(s.inputs).toEqual([
        { source: "runContext", key: "goal" },
        { source: "runContext", key: "customerId" },
      ]);
    });

    it("builds inputsFromStep", () => {
      const s = step("d", "D")
        .inputsFromStep("prev", "path")
        .build();
      expect(s.inputs).toEqual([{ source: "stepOutput", stepId: "prev", key: "path" }]);
    });

    it("builds dependencies", () => {
      const s = step("e", "E").dependsOn("a", "b").build();
      expect(s.dependencies).toEqual(["a", "b"]);
    });

    it("supports type and tools", () => {
      const s = step("t", "Tool step")
        .type("tool")
        .tools("read_file", "grep")
        .build();
      expect(s.type).toBe("tool");
      expect(s.allowedTools).toEqual(["read_file", "grep"]);
    });

    it("supports custom retry policy", () => {
      const s = step("r", "R").retry(3, "fail").build();
      expect(s.retryPolicy).toEqual({ maxAttempts: 3, strategy: "fail" });
    });

    it("full chain produces valid step", () => {
      const s = step("find_doc", "Find document")
        .objective("Locate the contract.")
        .outputs("path")
        .inputsFromContext("customerId")
        .build();
      expect(s.id).toBe("find_doc");
      expect(s.name).toBe("Find document");
      expect(s.objective).toBe("Locate the contract.");
      expect(s.outputs).toEqual(["path"]);
      expect(s.inputs).toEqual([{ source: "runContext", key: "customerId" }]);
    });
  });

  describe("buildPlan()", () => {
    it("builds a plan from goal and steps", () => {
      const steps = [
        step("s1", "Step 1").outputs("o1").build(),
        step("s2", "Step 2").dependsOn("s1").outputs("o2").build(),
      ];
      const plan = buildPlan("My goal", steps);
      expect(plan.goal).toBe("My goal");
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe("s1");
      expect(plan.steps[1].id).toBe("s2");
      expect(plan.steps[1].dependencies).toEqual(["s1"]);
      expect(plan.id).toBe("plan-1");
      expect(plan.version).toBe(1);
      expect(plan.createdAt).toBeDefined();
    });

    it("accepts options for planId and version", () => {
      const plan = buildPlan("G", [step("x", "X").build()], {
        planId: "custom-1",
        version: 2,
      });
      expect(plan.id).toBe("custom-1");
      expect(plan.version).toBe(2);
    });
  });
});
