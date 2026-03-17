import { describe, it, expect } from "vitest";
import { createSingleStepPlanner, createFixedPlanPlanner } from "../../src/defaults/singleStepPlanner.js";
import { step } from "../../src/defaults/planBuilder.js";

describe("singleStepPlanner", () => {
  const baseInput = {
    goal: "Test goal",
    context: {},
    constraints: [],
    availableTools: [],
    options: {},
  };

  describe("createSingleStepPlanner()", () => {
    it("createPlan returns a one-step plan with goal", async () => {
      const planner = createSingleStepPlanner();
      const plan = await planner.createPlan(baseInput as any);
      expect(plan.goal).toBe("Test goal");
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].id).toBe("answer");
      expect(plan.steps[0].name).toBe("Answer");
      expect(plan.steps[0].outputs).toEqual(["answer"]);
      expect(plan.steps[0].inputs).toContainEqual({ source: "runContext", key: "goal" });
      expect(plan.id).toBeDefined();
      expect(plan.version).toBe(1);
      expect(plan.createdAt).toBeDefined();
    });

    it("replan returns plan with incremented version", async () => {
      const planner = createSingleStepPlanner();
      const plan = await planner.createPlan(baseInput as any);
      const replan = await planner.replan({
        ...baseInput,
        runId: "r1",
        currentPlan: plan,
        failedStepId: "answer",
      } as any);
      expect(replan.version).toBe(plan.version + 1);
      expect(replan.steps).toHaveLength(1);
    });
  });

  describe("createFixedPlanPlanner()", () => {
    it("createPlan returns plan with fixed steps and input goal", async () => {
      const steps = [
        step("a", "A").objective("Do A").outputs("a_out").build(),
        step("b", "B").dependsOn("a").objective("Do B").outputs("b_out").build(),
      ];
      const planner = createFixedPlanPlanner(steps);
      const plan = await planner.createPlan(baseInput as any);
      expect(plan.goal).toBe("Test goal");
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe("a");
      expect(plan.steps[1].id).toBe("b");
      expect(plan.steps[1].dependencies).toEqual(["a"]);
    });

    it("replan returns same steps with incremented version", async () => {
      const steps = [step("x", "X").outputs("out").build()];
      const planner = createFixedPlanPlanner(steps);
      const plan = await planner.createPlan(baseInput as any);
      const replan = await planner.replan({
        ...baseInput,
        runId: "r1",
        currentPlan: plan,
        failedStepId: "x",
      } as any);
      expect(replan.version).toBe(plan.version + 1);
      expect(replan.steps).toHaveLength(1);
      expect(replan.steps[0].id).toBe("x");
    });
  });
});
