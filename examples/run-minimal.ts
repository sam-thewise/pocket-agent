/**
 * Minimal planner, executor, and evaluator from the README (no LLM, no API key).
 * Run: npm run example:minimal
 */

import { createAgentRunner } from "../src/runner/createAgentRunner.js";
import type { Plan, StepDefinition } from "../src/types/plan.js";
import type { Planner } from "../src/planner/Planner.js";
import type { StepExecutor } from "../src/executor/StepExecutor.js";
import type { StepEvaluator } from "../src/evaluator/StepEvaluator.js";
import type { PlannerInput, ReplanInput } from "../src/types/planner.js";
import type { StepExecutionInput } from "../src/types/executor.js";
import type { StepEvaluationInput } from "../src/types/evaluator.js";
import type { EvaluationResult } from "../src/types/step.js";

const planner: Planner = {
  async createPlan(input: PlannerInput): Promise<Plan> {
    const steps: StepDefinition[] = [
      {
        id: "find_doc",
        name: "Find document",
        type: "transform",
        objective: "Locate the latest contract from context.",
        dependencies: [],
        allowedTools: [],
        inputs: [{ source: "runContext", key: "customerId" }],
        outputs: ["path"],
        completionCriteria: ["Path or document id is produced"],
        retryPolicy: { maxAttempts: 2, strategy: "retry_with_feedback" },
      },
      {
        id: "summarize",
        name: "Summarize",
        type: "transform",
        objective: "Extract payment terms and risks from the document.",
        dependencies: ["find_doc"],
        allowedTools: [],
        inputs: [
          { source: "stepOutput", stepId: "find_doc", key: "path" },
          { source: "runContext", key: "goal" },
        ],
        outputs: ["summary"],
        completionCriteria: ["Summary with payment terms and risks"],
        retryPolicy: { maxAttempts: 2, strategy: "retry_with_feedback" },
      },
    ];
    return {
      id: "plan-1",
      version: 1,
      goal: input.goal,
      steps,
      createdAt: new Date().toISOString(),
    };
  },
  async replan(input: ReplanInput): Promise<Plan> {
    return { ...input.currentPlan, version: input.currentPlan.version + 1 };
  },
};

const executor: StepExecutor = {
  async execute(input: StepExecutionInput) {
    const startedAt = new Date().toISOString();
    const outKey = input.step.outputs?.[0] ?? "output";
    const value = `Result for ${input.step.id} (attempt ${input.attempt})`;
    const completedAt = new Date().toISOString();
    return {
      stepId: input.step.id,
      attempt: input.attempt,
      status: "success" as const,
      structuredOutput: { [outKey]: value },
      rawOutput: value,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  },
};

const evaluator: StepEvaluator = {
  async evaluate(input: StepEvaluationInput): Promise<EvaluationResult> {
    const out = input.attemptResult.structuredOutput;
    const expectedKey = input.step.outputs?.[0];
    const ok =
      input.attemptResult.status === "success" &&
      expectedKey != null &&
      out != null &&
      out[expectedKey] != null &&
      String(out[expectedKey]).trim().length > 0;
    return {
      stepId: input.step.id,
      attempt: input.attemptResult.attempt,
      verdict: ok ? "complete" : "failed",
      reasons: ok ? ["Output present"] : [expectedKey ? `Missing or empty "${expectedKey}"` : "Missing output"],
    };
  },
};

const runner = createAgentRunner({ planner, executor, evaluator });
const run = await runner.run({
  goal: "Find the latest contract, extract payment terms, and summarize risks.",
  context: { customerId: "abc123" },
  constraints: ["Use only connected files", "Cite source evidence where possible"],
});

console.log("Plan steps:", run.plan.steps.map((s) => s.id));
console.log("Step statuses:", Object.fromEntries(Object.entries(run.steps).map(([id, r]) => [id, r.status])));
console.log("Outputs:", run.outputs);
