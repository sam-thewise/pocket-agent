/**
 * Example: createAgentRunner with stub planner/executor/evaluator (spec §4.3, §4.4).
 * Run with: npx tsx examples/run-example.ts (or ts-node with ESM)
 */

import { createAgentRunner } from "../src/runner/createAgentRunner.js";
import { makeMinimalPlan, createStubPlanner, createStubExecutor, createStubEvaluator } from "../tests/helpers/stubs.js";

const plan = makeMinimalPlan([
  { id: "find_doc", name: "Find doc", outputs: ["path"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
  { id: "summarize", name: "Summarize", dependencies: ["find_doc"], outputs: ["summary"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
]);

const runner = createAgentRunner({
  planner: createStubPlanner(plan),
  executor: createStubExecutor(),
  evaluator: createStubEvaluator("complete"),
});

async function main() {
  console.log("--- runner.run() ---");
  const run = await runner.run({
    goal: "Find the latest contract, extract payment terms, and summarize risks.",
    context: { customerId: "abc123" },
    constraints: ["Use only connected files", "Cite source evidence where possible"],
  });
  console.log("Plan steps:", run.plan.steps.map((s) => s.id));
  console.log("Step statuses:", Object.fromEntries(Object.entries(run.steps).map(([id, r]) => [id, r.status])));
  console.log("Outputs:", run.outputs);

  console.log("\n--- runner.start() with events ---");
  const execution = runner.start({
    goal: "Read onboarding docs and extract action items",
  });
  execution.on("plan.created", (event) => {
    console.log("Plan created:", event.plan.steps.length, "steps");
  });
  execution.on("step.completed", (event) => {
    console.log("Step completed:", event.stepId, event.outputs);
  });
  execution.on("run.completed", (event) => {
    console.log("Run completed, outputs keys:", Object.keys(event.outputs ?? {}));
  });
  await execution.result;
  console.log("Done.");
}

main().catch(console.error);
