/**
 * Planner that uses an LLM to generate steps from the goal and context.
 * Lets you run goal-only (no predefined steps); the model defines the plan.
 */

import type { Plan, StepDefinition, StepInputRef } from "../types/plan.js";
import type { Planner } from "../planner/Planner.js";
import type { PlannerInput, ReplanInput } from "../types/planner.js";
import type { ModelAdapter } from "../types/models.js";
import { buildPlan } from "./planBuilder.js";
import { nowISO } from "../utils/time.js";

const DEFAULT_RETRY = { maxAttempts: 2, strategy: "retry_with_feedback" as const };

/** Parsed step shape we ask the LLM to return (simplified). */
interface LLMStepSpec {
  id?: string;
  name?: string;
  objective?: string;
  outputs?: string[];
  dependencies?: string[];
  inputsFromContext?: string[];
  inputsFromStep?: Array<{ stepId: string; key: string }>;
}

function parseStepsFromContent(content: string): LLMStepSpec[] {
  const trimmed = content.trim();
  const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = block ? block[1].trim() : trimmed;
  let data: { steps?: LLMStepSpec[] };
  try {
    data = JSON.parse(jsonStr) as { steps?: LLMStepSpec[] };
  } catch {
    return [];
  }
  const steps = data.steps;
  if (!Array.isArray(steps) || steps.length === 0) return [];
  return steps;
}

function specToStepDefinition(spec: LLMStepSpec, index: number): StepDefinition {
  const id = (spec.id ?? `step_${index}`).replace(/\s+/g, "_").slice(0, 80);
  const name = spec.name ?? id;
  const objective = spec.objective ?? "Complete this step.";
  const outputs = Array.isArray(spec.outputs) && spec.outputs.length > 0 ? spec.outputs : ["output"];
  const dependencies = Array.isArray(spec.dependencies) ? spec.dependencies : [];
  const inputs: StepInputRef[] = [];
  for (const key of spec.inputsFromContext ?? []) {
    inputs.push({ source: "runContext", key });
  }
  for (const { stepId, key } of spec.inputsFromStep ?? []) {
    if (stepId && key) inputs.push({ source: "stepOutput", stepId, key });
  }
  return {
    id,
    name,
    type: "transform",
    objective,
    dependencies,
    allowedTools: [],
    inputs,
    outputs,
    completionCriteria: outputs.map((k) => `Output "${k}" is produced.`),
    retryPolicy: DEFAULT_RETRY,
  };
}

export interface LLMPlannerOptions {
  /** If true, prompt asks for transform-only steps (no tools). Default true. */
  transformOnly?: boolean;
  /** Max steps to allow. Default 10. */
  maxSteps?: number;
  /** System hint for the plan (e.g. "Keep plans to 2–3 steps."). */
  planHint?: string;
}

const DEFAULT_OPTIONS: Required<Omit<LLMPlannerOptions, "planHint">> & { planHint?: string } = {
  transformOnly: true,
  maxSteps: 10,
  planHint: undefined,
};

function buildPlanPrompt(input: PlannerInput, options: LLMPlannerOptions): string {
  const { goal, context, constraints } = input;
  const hint = options.planHint ?? "Use 1–4 steps. Each step should have a clear objective and output key(s).";
  const toolList =
    input.availableTools.length > 0
      ? `Available tools (use only if needed): ${input.availableTools.map((t) => t.name).join(", ")}.`
      : "No tools are available; use only reasoning/transform steps.";
  const constraintStr = constraints.length > 0 ? `Constraints: ${constraints.join("; ")}` : "";
  return `You are a planning assistant. Given a goal and context, output a plan as a single JSON object.

Goal: ${goal}

Context (key-value): ${JSON.stringify(context)}

${constraintStr ? constraintStr + "\n\n" : ""}${toolList}

${hint}

Respond with ONLY a JSON object in this exact shape (no markdown, no explanation):
\`\`\`json
{
  "steps": [
    {
      "id": "unique_snake_case_id",
      "name": "Human-readable step name",
      "objective": "What this step must do",
      "outputs": ["output_key"],
      "dependencies": [],
      "inputsFromContext": ["goal"],
      "inputsFromStep": []
    }
  ]
}
\`\`\`

Rules: Step ids must be unique. Later steps can list earlier step ids in "dependencies" and reference their outputs in "inputsFromStep" as { "stepId": "id", "key": "output_key" }. Use "inputsFromContext" for keys from the run context (e.g. "goal"). Output only the JSON block.`;
}

/**
 * Creates a planner that calls the model to generate a plan from the goal and context.
 * Use for goal-only runs: no steps defined upfront; the LLM proposes the steps.
 */
export function createLLMPlanner(
  model: ModelAdapter,
  options: LLMPlannerOptions = {}
): Planner {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return {
    async createPlan(input: PlannerInput): Promise<Plan> {
      const prompt = buildPlanPrompt(input, opts);
      const out = await model.generate({ prompt });
      const content = (out.content ?? "").trim();
      const specs = parseStepsFromContent(content);
      const steps: StepDefinition[] = specs
        .slice(0, opts.maxSteps)
        .map((s, i) => specToStepDefinition(s, i));
      if (steps.length === 0) {
        const fallback: StepDefinition = {
          id: "answer",
          name: "Answer",
          type: "transform",
          objective: input.goal,
          dependencies: [],
          allowedTools: [],
          inputs: [{ source: "runContext", key: "goal" }],
          outputs: ["answer"],
          completionCriteria: ["Answer is produced."],
          retryPolicy: DEFAULT_RETRY,
        };
        return buildPlan(input.goal, [fallback]);
      }
      return buildPlan(input.goal, steps);
    },
    async replan(input: ReplanInput): Promise<Plan> {
      const prompt =
        buildPlanPrompt(
          {
            goal: input.goal,
            context: input.context,
            constraints: input.constraints,
            availableTools: input.availableTools,
            options: input.options,
          },
          opts
        ) +
        `\n\nPrevious plan failed at step "${input.failedStepId}". Suggest a revised plan (you may simplify or add recovery steps). Same JSON format.`;
      const out = await model.generate({ prompt });
      const content = (out.content ?? "").trim();
      const specs = parseStepsFromContent(content);
      const steps: StepDefinition[] = specs
        .slice(0, opts.maxSteps)
        .map((s, i) => specToStepDefinition(s, i));
      if (steps.length === 0) {
        return {
          ...input.currentPlan,
          version: input.currentPlan.version + 1,
        };
      }
      return buildPlan(input.goal, steps, {
        planId: input.currentPlan.id,
        version: input.currentPlan.version + 1,
      });
    },
  };
}
