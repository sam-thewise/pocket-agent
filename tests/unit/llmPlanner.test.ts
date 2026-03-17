import { describe, it, expect } from "vitest";
import { createLLMPlanner } from "../../src/defaults/llmPlanner.js";

function createMockModel(response: string) {
  return {
    generate: async () => ({ content: response }),
  };
}

describe("llmPlanner", () => {
  const baseInput = {
    goal: "Summarize the doc",
    context: { customerId: "c1" },
    constraints: [],
    availableTools: [],
    options: {},
  };

  it("createPlan parses JSON steps and returns plan", async () => {
    const json = `
\`\`\`json
{
  "steps": [
    {
      "id": "step_1",
      "name": "First",
      "objective": "Do first thing",
      "outputs": ["out1"],
      "dependencies": [],
      "inputsFromContext": ["goal"]
    },
    {
      "id": "step_2",
      "name": "Second",
      "objective": "Do second",
      "outputs": ["out2"],
      "dependencies": ["step_1"],
      "inputsFromStep": [{ "stepId": "step_1", "key": "out1" }]
    }
  ]
}
\`\`\`
`;
    const model = createMockModel(json);
    const planner = createLLMPlanner(model);
    const plan = await planner.createPlan(baseInput as any);
    expect(plan.goal).toBe("Summarize the doc");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].id).toBe("step_1");
    expect(plan.steps[0].name).toBe("First");
    expect(plan.steps[0].objective).toBe("Do first thing");
    expect(plan.steps[0].outputs).toEqual(["out1"]);
    expect(plan.steps[0].inputs).toEqual([{ source: "runContext", key: "goal" }]);
    expect(plan.steps[1].id).toBe("step_2");
    expect(plan.steps[1].dependencies).toEqual(["step_1"]);
    expect(plan.steps[1].inputs).toEqual([
      { source: "stepOutput", stepId: "step_1", key: "out1" },
    ]);
  });

  it("createPlan accepts raw JSON without markdown block", async () => {
    const json = '{"steps":[{"id":"a","name":"A","objective":"O","outputs":["x"]}]}';
    const model = createMockModel(json);
    const planner = createLLMPlanner(model);
    const plan = await planner.createPlan(baseInput as any);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].id).toBe("a");
    expect(plan.steps[0].outputs).toEqual(["x"]);
  });

  it("createPlan falls back to single answer step when JSON invalid or empty", async () => {
    const model = createMockModel("not json at all");
    const planner = createLLMPlanner(model);
    const plan = await planner.createPlan(baseInput as any);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].id).toBe("answer");
    expect(plan.steps[0].outputs).toEqual(["answer"]);
  });

  it("createPlan falls back when steps array is empty", async () => {
    const model = createMockModel('{"steps":[]}');
    const planner = createLLMPlanner(model);
    const plan = await planner.createPlan(baseInput as any);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].id).toBe("answer");
  });

  it("respects maxSteps option", async () => {
    const json = JSON.stringify({
      steps: [
        { id: "s1", name: "S1", objective: "O1", outputs: ["o1"] },
        { id: "s2", name: "S2", objective: "O2", outputs: ["o2"] },
        { id: "s3", name: "S3", objective: "O3", outputs: ["o3"] },
      ],
    });
    const model = createMockModel(json);
    const planner = createLLMPlanner(model, { maxSteps: 2 });
    const plan = await planner.createPlan(baseInput as any);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].id).toBe("s1");
    expect(plan.steps[1].id).toBe("s2");
  });

  it("replan calls model and returns revised plan", async () => {
    const json = '{"steps":[{"id":"recovery","name":"Recovery","objective":"Fix it","outputs":["result"]}]}';
    const model = createMockModel(json);
    const planner = createLLMPlanner(model);
    const currentPlan = {
      id: "p1",
      version: 1,
      goal: "Goal",
      steps: [{ id: "old", name: "Old", type: "transform" as const, objective: "", dependencies: [], allowedTools: [], inputs: [], outputs: ["x"], completionCriteria: [], retryPolicy: { maxAttempts: 1, strategy: "fail" } }],
      createdAt: new Date().toISOString(),
    };
    const replan = await planner.replan({
      ...baseInput,
      runId: "r1",
      currentPlan,
      failedStepId: "old",
    } as any);
    expect(replan.version).toBe(2);
    expect(replan.steps).toHaveLength(1);
    expect(replan.steps[0].id).toBe("recovery");
  });

  it("replan returns current plan with bumped version when response not parseable", async () => {
    const model = createMockModel("invalid");
    const planner = createLLMPlanner(model);
    const currentPlan = {
      id: "p1",
      version: 1,
      goal: "G",
      steps: [{ id: "s1", name: "S", type: "transform" as const, objective: "", dependencies: [], allowedTools: [], inputs: [], outputs: ["o"], completionCriteria: [], retryPolicy: { maxAttempts: 1, strategy: "fail" } }],
      createdAt: new Date().toISOString(),
    };
    const replan = await planner.replan({
      ...baseInput,
      runId: "r1",
      currentPlan,
      failedStepId: "s1",
    } as any);
    expect(replan.version).toBe(2);
    expect(replan.steps).toEqual(currentPlan.steps);
  });
});
