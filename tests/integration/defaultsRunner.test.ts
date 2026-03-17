import { describe, it, expect } from "vitest";
import { createAgentRunner } from "../../src/runner/createAgentRunner.js";
import { createSingleStepPlanner, createFixedPlanPlanner } from "../../src/defaults/singleStepPlanner.js";
import { createDefaultExecutor } from "../../src/defaults/defaultExecutor.js";
import { createLLMEvaluator } from "../../src/adapters/createLLMEvaluator.js";
import { step } from "../../src/defaults/planBuilder.js";

/**
 * Mock model: return evaluator verdict when prompt looks like evaluation (criteria, step result),
 * otherwise return executor content.
 */
function createMockModel(
  executorContent: string,
  evaluatorContent?: string
): { generate: (input: { prompt?: string }) => Promise<{ content?: string }> } {
  return {
    generate: async (input: { prompt?: string }) => {
      const p = input.prompt ?? "";
      const isEvaluation =
        p.includes("Completion criteria") ||
        p.includes("Is this step complete") ||
        p.includes("evaluating whether");
      if (isEvaluation) {
        return {
          content:
            evaluatorContent ??
            '```json\n{"verdict":"complete","reasons":["Output present"]}\n```',
        };
      }
      return { content: executorContent };
    },
  };
}

describe("Runner with default planner, executor, evaluator", () => {
  it("runs with single-step planner and default executor (mock model)", async () => {
    const model = createMockModel("The answer is 4.");
    const runner = createAgentRunner({
      planner: createSingleStepPlanner(),
      executor: createDefaultExecutor({ model }),
      evaluator: createLLMEvaluator(model),
      model,
    });
    const result = await runner.run({
      goal: "What is 2+2?",
      context: {},
    });
    expect(result.status).toBe("completed");
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].id).toBe("answer");
    expect(result.outputs?.answer).toContain("4");
  });

  it("runs with fixed plan (fluent steps) and default executor (mock model)", async () => {
    const steps = [
      step("first", "First")
        .objective("Produce a number.")
        .outputs("num")
        .inputsFromContext("goal")
        .build(),
      step("second", "Second")
        .objective("Double the number.")
        .outputs("result")
        .dependsOn("first")
        .inputsFromStep("first", "num")
        .build(),
    ];
    let callCount = 0;
    const model = {
      generate: async (input: { prompt?: string }) => {
        callCount++;
        if ((input.prompt ?? "").toLowerCase().includes("verdict")) {
          return {
            content: '```json\n{"verdict":"complete","reasons":["ok"]}\n```',
          };
        }
        return { content: callCount === 1 ? "42" : "84" };
      },
    };
    const runner = createAgentRunner({
      planner: createFixedPlanPlanner(steps),
      executor: createDefaultExecutor({ model }),
      evaluator: createLLMEvaluator(model),
      model,
    });
    const result = await runner.run({
      goal: "Get a number and double it.",
      context: {},
    });
    expect(result.status).toBe("completed");
    expect(result.plan.steps).toHaveLength(2);
    expect(result.outputs?.num).toBe("42");
    expect(result.outputs?.result).toBe("84");
  });
});
