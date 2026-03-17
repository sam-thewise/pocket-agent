# Fluent plan and default executor

Build plans with a short fluent API and run them with a model-based executor so you don’t write raw step objects or executor logic.

## Fluent steps and plan

```ts
import {
  step,
  createFixedPlanPlanner,
  createDefaultExecutor,
  createLLMEvaluator,
  createOpenAIModelAdapter,
  createAgentRunner,
} from "pocket-agent";

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
console.log(run.outputs?.summary);
```

**Step builder:** `step(id, name).objective("...").outputs("key").inputsFromContext("key").inputsFromStep(stepId, "key").dependsOn("id").build()`. Then `createFixedPlanPlanner(steps)` to use that plan every run. Use `createDefaultExecutor({ model })` so each step is run by prompting the model (no tools). For a single “answer the goal” step with zero config, use `createQuickAgent({ provider: "openai" })` or `createSingleStepPlanner()`.

[← Back to README](https://github.com/sam-thewise/pocket-agent/blob/master/README.md)
