# Contracts

**You provide:**

| Role            | Contract |
|-----------------|----------|
| **Planner**     | `createPlan(input)`, `replan(input)` → `Plan` |
| **StepExecutor** | `execute(input)` → `StepAttemptResult` |
| **StepEvaluator** | `evaluate(input)` → `EvaluationResult` |
| **Tools** (optional) | `Record<string, ToolAdapter>` |

The package orchestrates planning, scheduling, execution, evaluation, retries, and replanning.

[← Back to README](https://github.com/sam-thewise/pocket-agent/blob/master/README.md)
