/**
 * Coding project planner: plans the structure of a project from user description.
 *
 * Usage:
 *   npm run example:planner -- "A REST API with Express and SQLite for a todo app"
 *   npm run example:planner -- "CLI tool in Node that converts markdown to PDF"
 *
 * Uses the same OpenAI/LM Studio env as run-with-openai (OPENAI_BASE_URL, OPENAI_MODEL, etc.).
 * No tools—all steps are transform steps (model generates structure from the user's request).
 */

import { createAgentRunner } from "../src/runner/createAgentRunner.js";
import type { Plan, StepDefinition } from "../src/types/plan.js";
import type { Planner } from "../src/planner/Planner.js";
import type { StepExecutor } from "../src/executor/StepExecutor.js";
import type { StepEvaluator } from "../src/evaluator/StepEvaluator.js";
import type { PlannerInput } from "../src/types/planner.js";
import type { ReplanInput } from "../src/types/planner.js";
import type { StepExecutionInput } from "../src/types/executor.js";
import type { StepEvaluationInput } from "../src/types/evaluator.js";
import type { StepAttemptResult } from "../src/types/step.js";
import type { EvaluationResult } from "../src/types/step.js";
import type { ModelAdapter } from "../src/types/models.js";
import { nowISO } from "../src/utils/time.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? process.env.MODEL ?? "gpt-4o-mini";
const OPENAI_MAX_TOKENS = process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS, 10) : 4096;

const isLocal = Boolean(OPENAI_BASE_URL);
const apiKey = OPENAI_API_KEY ?? (isLocal ? "local" : undefined);

if (!apiKey && !isLocal) {
  console.error("Missing OPENAI_API_KEY. Set it, or use a local endpoint with OPENAI_BASE_URL.");
  process.exit(1);
}

async function getOpenAI() {
  const openai = await import("openai");
  const key = apiKey ?? "local";
  const config: { apiKey: string; baseURL?: string } = { apiKey: key };
  if (OPENAI_BASE_URL) config.baseURL = OPENAI_BASE_URL;
  return new openai.default(config);
}

const DEFAULT_RETRY = { maxAttempts: 2, strategy: "retry_with_feedback" as const };

function buildPlan(goal: string): StepDefinition[] {
  return [
    {
      id: "understand_request",
      name: "Understand request",
      type: "transform",
      objective:
        "Extract and list the project requirements from the user's description: what they want to build, tech preferences (language, framework, DB), and any constraints. Output a concise requirements summary in <final_answer>.",
      dependencies: [],
      allowedTools: [],
      inputs: [{ source: "runContext", key: "goal" }],
      outputs: ["requirements"],
      completionCriteria: ["Requirements summary in <final_answer> block"],
      retryPolicy: DEFAULT_RETRY,
    },
    {
      id: "design_structure",
      name: "Design structure",
      type: "transform",
      objective:
        "Design the project structure: directory layout, key files and folders, and a short purpose for each. Include config files, entry points, and main modules. Output the structure (e.g. tree or list with descriptions) in <final_answer>.",
      dependencies: ["understand_request"],
      allowedTools: [],
      inputs: [
        { source: "stepOutput", stepId: "understand_request", key: "requirements" },
        { source: "runContext", key: "goal" },
      ],
      outputs: ["structure"],
      completionCriteria: ["Project structure in <final_answer> block"],
      retryPolicy: DEFAULT_RETRY,
    },
    {
      id: "format_plan",
      name: "Format plan",
      type: "transform",
      objective:
        "Format the project plan as a clear, copy-paste-friendly markdown document: title, brief overview, directory tree, key files with one-line descriptions, and optional next steps. Put the entire formatted plan in <final_answer>.",
      dependencies: ["design_structure"],
      allowedTools: [],
      inputs: [
        { source: "stepOutput", stepId: "design_structure", key: "structure" },
        { source: "stepOutput", stepId: "understand_request", key: "requirements" },
        { source: "runContext", key: "goal" },
      ],
      outputs: ["answer"],
      completionCriteria: ["Formatted plan in <final_answer> block"],
      retryPolicy: DEFAULT_RETRY,
    },
  ];
}

const FINAL_ANSWER_TAG = "final_answer";

function extractFinalAnswerBlock(content: string): string | null {
  const openLower = content.toLowerCase();
  const tagLower = FINAL_ANSWER_TAG.toLowerCase();
  const startIdx = openLower.indexOf(`<${tagLower}>`);
  const endIdx = openLower.indexOf(`</${tagLower}>`);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const openTagEnd = content.indexOf(">", startIdx) + 1;
    const between = content.slice(openTagEnd, endIdx).trim();
    if (between.length > 0) return between;
  }
  if (endIdx !== -1) {
    const afterClose = content.indexOf(">", endIdx) + 1;
    const after = content.slice(afterClose).trim();
    if (after.length > 0) return after;
  }
  return null;
}

function stepOutputFromContent(step: StepExecutionInput["step"], content: string): Record<string, unknown> {
  const key = step.outputs?.[0] ?? "output";
  return { [key]: content };
}

const planner: Planner = {
  async createPlan(input: PlannerInput): Promise<Plan> {
    return {
      id: "plan-1",
      version: 1,
      goal: input.goal,
      steps: buildPlan(input.goal),
      createdAt: nowISO(),
    };
  },
  async replan(input: ReplanInput): Promise<Plan> {
    return {
      ...input.currentPlan,
      version: input.currentPlan.version + 1,
      steps: buildPlan(input.currentPlan.goal),
    };
  },
};

const executor: StepExecutor = {
  async execute(input: StepExecutionInput): Promise<StepAttemptResult> {
    const model = input.model;
    if (!model) {
      return {
        stepId: input.step.id,
        attempt: input.attempt,
        status: "error",
        error: { code: "NO_MODEL", message: "No model adapter provided" },
        startedAt: nowISO(),
        completedAt: nowISO(),
        durationMs: 0,
      };
    }
    const startedAt = nowISO();
    const contextStr = JSON.stringify(input.resolvedInputs, null, 2);
    const prompt = `Step: ${input.step.name}

Objective: ${input.step.objective}

Inputs from context and previous steps:
${contextStr}

Output your result inside exactly this block. First line: <${FINAL_ANSWER_TAG}>
Then your content. Last line: </${FINAL_ANSWER_TAG}>`;
    const out = await model.generate({ prompt });
    const raw = (out.content ?? "").trim();
    const content = extractFinalAnswerBlock(raw) ?? raw;
    const completedAt = nowISO();
    const structuredOutput = stepOutputFromContent(input.step, content);
    return {
      stepId: input.step.id,
      attempt: input.attempt,
      status: "success",
      structuredOutput,
      rawOutput: content,
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
      reasons: ok ? ["Step output present"] : [expectedKey ? `Missing or empty output for "${expectedKey}"` : "Missing output"],
    };
  },
};

function createModelAdapter(): ModelAdapter {
  return {
    async generate(input) {
      const openai = await getOpenAI();
      const prompt = typeof input.prompt === "string" ? input.prompt : "";
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: Number.isFinite(OPENAI_MAX_TOKENS) && OPENAI_MAX_TOKENS > 0 ? OPENAI_MAX_TOKENS : 4096,
      });
      const content = completion.choices[0]?.message?.content ?? "";
      return { content, raw: completion };
    },
  };
}

async function main() {
  if (OPENAI_BASE_URL) console.log("Using API URL:", OPENAI_BASE_URL);
  console.log("Model:", OPENAI_MODEL);
  console.log("Project planner (no tools)\n");

  const runner = createAgentRunner({
    planner,
    executor,
    evaluator,
    model: createModelAdapter(),
    tools: {},
  });

  const goal =
    process.argv[2] ??
    "A REST API with Express and SQLite for a todo app, with auth and CRUD for tasks.";
  const context = { goal };

  const execution = runner.start({ goal, context });

  execution.on("plan.created", (event) => {
    const plan = (event as { plan?: { steps?: { id: string; name: string }[] } }).plan;
    const steps = plan?.steps ?? [];
    console.log("[runner] Plan created:", steps.length, "step(s)");
    steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.id} (${s.name})`));
  });
  execution.on("step.started", (event) => {
    const e = event as { stepId?: string };
    console.log("[runner] Step started:", e.stepId);
  });
  execution.on("step.completed", (event) => {
    const e = event as { stepId?: string };
    console.log("[runner] Step completed:", e.stepId);
  });
  execution.on("step.failed", (event) => {
    const e = event as { stepId?: string; error?: unknown };
    console.error("[runner] Step failed:", e.stepId, e.error ?? "");
  });
  execution.on("run.completed", () => console.log("[runner] Run completed"));
  execution.on("run.failed", (event) => console.error("[runner] Run failed", (event as { error?: unknown }).error ?? ""));

  const run = await execution.result;

  console.log("\n--- Result ---");
  console.log("Goal:", goal);
  console.log("Status:", run.status);
  const answer = run.outputs?.answer ?? run.steps["format_plan"]?.finalOutput?.answer;
  if (answer) {
    console.log("\nProject plan:\n");
    console.log(typeof answer === "string" ? answer : JSON.stringify(answer, null, 2));
  } else {
    console.log("Plan: (none)");
    const failedStep = run.plan.steps.find((s) => run.steps[s.id]?.status === "failed");
    if (failedStep) {
      const lastAttempt = run.steps[failedStep.id]?.attempts?.slice(-1)[0];
      const msg = lastAttempt?.error && typeof lastAttempt.error === "object" && "message" in lastAttempt.error
        ? (lastAttempt.error as { message?: string }).message
        : String(lastAttempt?.error ?? "Unknown error");
      console.error("Error:", msg);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
