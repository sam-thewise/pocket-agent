/**
 * Default executor that runs each step by calling the model with the step objective
 * and resolved inputs. No tool-calling; use for transform-only plans (e.g. quick start).
 */

import type { StepExecutor } from "../executor/StepExecutor.js";
import type { StepExecutionInput } from "../types/executor.js";
import type { StepAttemptResult } from "../types/step.js";
import type { ModelAdapter } from "../types/models.js";
import { nowISO } from "../utils/time.js";

export interface DefaultExecutorOptions {
  /** Model used to generate step output. Required. */
  model: ModelAdapter;
  /** Optional instruction appended to every prompt (e.g. "Respond concisely."). */
  systemPrompt?: string;
}

/**
 * Creates an executor that runs each step by prompting the model with the step's
 * objective and resolved inputs, then mapping the model output to the step's first
 * output key. No tools; use for simple transform steps. For tool-calling steps,
 * use a custom executor or see the run-with-openai example.
 */
export function createDefaultExecutor(options: DefaultExecutorOptions): StepExecutor {
  const { model, systemPrompt } = options;
  return {
    async execute(input: StepExecutionInput): Promise<StepAttemptResult> {
      const startedAt = nowISO();
      const outKey = input.step.outputs?.[0] ?? "output";
      if (!model) {
        const completedAt = nowISO();
        return {
          stepId: input.step.id,
          attempt: input.attempt,
          status: "error",
          error: { code: "NO_MODEL", message: "No model adapter provided." },
          startedAt,
          completedAt,
          durationMs: 0,
        };
      }
      try {
        const contextStr = JSON.stringify(input.resolvedInputs, null, 2);
        const prompt =
          (systemPrompt ? systemPrompt + "\n\n" : "") +
          `Step: ${input.step.name}\nObjective: ${input.step.objective}\n\nContext from previous steps and run:\n${contextStr}\n\nProduce a single result for the output "${outKey}". Write only the answer content, no preamble.`;
        const out = await model.generate({ prompt });
        const content = (out.content ?? "").trim();
        const completedAt = nowISO();
        const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
        return {
          stepId: input.step.id,
          attempt: input.attempt,
          status: "success",
          structuredOutput: { [outKey]: content },
          rawOutput: content,
          startedAt,
          completedAt,
          durationMs,
        };
      } catch (err) {
        const completedAt = nowISO();
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
}
