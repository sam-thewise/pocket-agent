## Using pocket-agent from AI coding agents

This guide shows how to use `pocket-agent` from tools like Cursor, Claude, or other AI coding assistants.

### 1. Install

```bash
npm install pocket-agent
# optional: provider SDKs, e.g.
npm install openai
```

Set env vars (example for OpenAI):

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional)

See the other docs for Anthropic, Gemini, Ollama, and LM Studio.

### 2. Quick agent (single goal)

Use the built-in quick agent when you just want “goal in → answer out”.

```ts
import { createQuickAgent } from "pocket-agent";

const runner = createQuickAgent({ provider: "openai" });

export async function runPocketAgent(goal: string) {
  const run = await runner.run({ goal });
  return run.outputs?.answer ?? run.outputs;
}
```

From Cursor or Claude, you can ask:

> Install `pocket-agent` and add a helper function `runPocketAgent(goal)` that uses `createQuickAgent`.

### 3. Multi-step, goal-driven agent

Let the LLM generate a plan of steps from the goal.

```ts
import { createGoalDrivenAgent } from "pocket-agent";

const runner = createGoalDrivenAgent({
  provider: "openai",
  useLLMPlanner: true,
  llmPlannerOptions: { maxSteps: 5 },
});

export async function runPocketAgentWithPlan(goal: string) {
  const run = await runner.run({ goal });
  return { plan: run.plan, outputs: run.outputs };
}
```

### 4. Integrating into existing projects

- Call `runPocketAgent(goal)` from HTTP handlers, CLI commands, or background jobs.
- Use the optional `context` parameter on `runner.run({ goal, context })` to pass extra inputs (user id, repo path, configuration, etc.).

### 5. Examples in this repo

- Quick start example: `examples/run-quick-start.ts`
- Goal-driven LLM planner example: `examples/run-goal-driven-llm.ts`
- Full project tools and OpenAI/local usage: `examples/run-with-openai.ts`

See the main README for more details about planners, executors, evaluators, and tools.

