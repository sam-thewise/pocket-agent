/**
 * Fluent plan + default executor from the README.
 * Set OPENAI_API_KEY then: npm run example:fluent-plan
 */

import { step, buildPlan, createFixedPlanPlanner, createDefaultExecutor, createLLMEvaluator, createOpenAIModelAdapter, createAgentRunner } from "../src/index.js";

const steps = [
  step("find_doc", "Find document")
    .objective("Locate the latest contract from context.")
    .outputs("path")
    .inputsFromContext("customerId")
    .build(),
  step("summarize", "Summarize")
    .objective("Extract payment terms and risks.")
    .outputs("summary")
    .dependsOn("find_doc")
    .inputsFromStep("find_doc", "path")
    .inputsFromContext("goal")
    .build(),
];

const model = createOpenAIModelAdapter();
const runner = createAgentRunner({
  planner: createFixedPlanPlanner(steps),
  executor: createDefaultExecutor({ model }),
  evaluator: createLLMEvaluator(model),
  model,
});

const run = await runner.run({
  goal: "Summarize the contract.",
  context: { customerId: "abc123" },
});

console.log("Plan steps:", run.plan.steps.map((s) => s.id));
console.log("Output path:", run.outputs?.path ?? "(none)");
console.log("Output summary:", run.outputs?.summary ?? "(none)");
