# Custom planner and executor

When you want your own plan or execution logic, use `createAgentRunner` with a planner, executor, and evaluator (or `provider` for a default evaluator).

## Minimal planner

A **planner** implements `createPlan(input)` and `replan(input)`, returning a `Plan` (goal + steps).

```ts
import type { Plan, StepDefinition } from "pocket-agent";
import type { Planner } from "pocket-agent";
import type { PlannerInput, ReplanInput } from "pocket-agent";

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
```

## Minimal executor

An **executor** implements `execute(input)`, returning a `StepAttemptResult`.

```ts
import type { StepExecutor } from "pocket-agent";
import type { StepExecutionInput } from "pocket-agent";
import type { StepAttemptResult } from "pocket-agent";

const executor: StepExecutor = {
  async execute(input: StepExecutionInput): Promise<StepAttemptResult> {
    const startedAt = new Date().toISOString();
    const outKey = input.step.outputs?.[0] ?? "output";
    try {
      const value = `Result for ${input.step.id} (attempt ${input.attempt})`;
      const completedAt = new Date().toISOString();
      return {
        stepId: input.step.id,
        attempt: input.attempt,
        status: "success",
        structuredOutput: { [outKey]: value },
        rawOutput: value,
        startedAt,
        completedAt,
        durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      };
    } catch (err) {
      const completedAt = new Date().toISOString();
      return {
        stepId: input.step.id,
        attempt: input.attempt,
        status: "error",
        error: {
          code: "EXEC_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
        startedAt,
        completedAt,
        durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      };
    }
  },
};
```

## Minimal evaluator

```ts
import type { StepEvaluator } from "pocket-agent";
import type { StepEvaluationInput } from "pocket-agent";
import type { EvaluationResult } from "pocket-agent";

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
```

With `planner`, `executor`, and `evaluator` defined as above, pass them into `createAgentRunner`. For a default LLM-based evaluator instead, use `provider` (see [Default evaluators and providers](default-evaluators-and-providers.md)).

[← Back to README](../README.md)
