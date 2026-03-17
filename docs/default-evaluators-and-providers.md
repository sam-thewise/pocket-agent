# Default evaluators and providers

You don’t have to implement an evaluator yourself. Use a **default LLM evaluator** and **provider model adapters** (OpenAI, Anthropic, Gemini, Ollama, LM Studio); the package builds the evaluator from your API key and env.

## Use `provider` in `createAgentRunner`

Set `provider` and optionally `modelConfig`. We create the model adapter and a default LLM evaluator; you still provide `planner` and `executor`:

```ts
import { createAgentRunner } from "pocket-agent";

const runner = createAgentRunner({
  provider: "openai",
  modelConfig: { model: "gpt-4o-mini" },
  planner,
  executor,
  tools: myTools,
});

const run = await runner.run({ goal: "…", context: {} });
```

Supported providers: `"openai"` | `"anthropic"` | `"gemini"` | `"ollama"` | `"lmstudio"`.

| Provider     | Env vars (examples) | SDK to install              |
|-------------|----------------------|-----------------------------|
| **openai**  | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | `npm install openai` |
| **anthropic** | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `npm install @anthropic-ai/sdk` |
| **gemini**  | `GEMINI_API_KEY`, `GEMINI_MODEL` | `npm install @google/genai` |
| **ollama**  | `OPENAI_BASE_URL` (default `http://localhost:11434/v1`), `OPENAI_MODEL`, `OLLAMA_USE_STREAMING=1` | `npm install openai` |
| **lmstudio** | `OPENAI_BASE_URL` (default `http://localhost:1234/v1`), `OPENAI_MODEL`, `USE_LM_STUDIO_STREAMING=1` | `npm install openai` |

(These SDKs are optional dependencies of `pocket-agent`.)

## Use the evaluator and adapters directly

```ts
import {
  createAgentRunner,
  createLLMEvaluator,
  createOpenAIModelAdapter,
  createAnthropicModelAdapter,
  createGeminiModelAdapter,
  createOllamaModelAdapter,
  createLmStudioModelAdapter,
} from "pocket-agent";

const model = createOpenAIModelAdapter();
const evaluator = createLLMEvaluator(model);

const runner = createAgentRunner({
  planner,
  executor,
  evaluator,
  model,
  tools: myTools,
});
```

Same pattern for Anthropic or Gemini. The **LLM evaluator** asks the model whether a step’s completion criteria are satisfied and returns a verdict (`complete` | `retry` | `needs_replan` | `failed`) with reasons.

[← Back to README](../README.md)
