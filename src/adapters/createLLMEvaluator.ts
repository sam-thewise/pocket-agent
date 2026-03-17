/**
 * Default LLM-based step evaluator. Uses any ModelAdapter to judge whether a step
 * attempt satisfies the step's completion criteria.
 */

import type { StepEvaluator } from "../evaluator/StepEvaluator.js";
import type { StepEvaluationInput } from "../types/evaluator.js";
import type { EvaluationResult, EvaluationVerdict } from "../types/step.js";
import type { ModelAdapter } from "../types/models.js";

export interface LLMEvaluatorOptions {
  /** If true, ask the model to return JSON in a ```json block. Default true. */
  useJsonBlock?: boolean;
  /** Max length of rawOutput to include in the prompt. Default 8000. */
  maxOutputChars?: number;
}

const DEFAULT_OPTIONS: Required<LLMEvaluatorOptions> = {
  useJsonBlock: true,
  maxOutputChars: 8000,
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n...[truncated]";
}

function buildPrompt(input: StepEvaluationInput, options: Required<LLMEvaluatorOptions>): string {
  const { step, attemptResult, priorAttempts } = input;
  const rawStr =
    attemptResult.rawOutput != null
      ? typeof attemptResult.rawOutput === "string"
        ? attemptResult.rawOutput
        : JSON.stringify(attemptResult.rawOutput, null, 2)
      : "";
  const structuredStr =
    attemptResult.structuredOutput != null
      ? JSON.stringify(attemptResult.structuredOutput, null, 2)
      : "(none)";
  const rawTruncated = truncate(rawStr, options.maxOutputChars);
  const criteria = (step.completionCriteria ?? []).join("\n- ");
  const priorSummary =
    priorAttempts.length > 0
      ? `\nPrior attempts: ${priorAttempts.length}. Last had status: ${priorAttempts[priorAttempts.length - 1]?.status}.`
      : "";

  const jsonInstruction = options.useJsonBlock
    ? `Respond with a single JSON object in a fenced code block (\\\`\\\`\\\`json ... \\\`\\\`\\\`). The JSON must have:
- "verdict": one of "complete", "retry", "needs_replan", "failed"
- "reasons": array of short strings explaining your decision
- "missingCriteria" (optional): array of criteria not yet satisfied
- "confidence" (optional): number 0-1
- "suggestedAction" (optional): string for retry/replan`
    : `Respond with exactly:
VERDICT: complete|retry|needs_replan|failed
REASONS: one or more short lines
Optional lines: MISSING_CRITERIA: ... CONFIDENCE: 0-1 SUGGESTED_ACTION: ...`;

  return `You are evaluating whether a step in a plan-driven agent run is complete.

Step:
- id: ${step.id}
- name: ${step.name ?? step.id}
- objective: ${step.objective}
- expected outputs: ${(step.outputs ?? []).join(", ")}

Completion criteria (all should be satisfied for "complete"):
- ${criteria || "(none specified)"}

Attempt result:
- status: ${attemptResult.status}
- structuredOutput: ${structuredStr}
- rawOutput (excerpt): ${rawTruncated}${priorSummary}

Is this step complete, should we retry, replan, or mark failed?

${jsonInstruction}`;
}

function parseResponse(
  content: string,
  stepId: string,
  attempt: number,
  useJsonBlock: boolean
): EvaluationResult {
  const verdicts: EvaluationVerdict[] = ["complete", "retry", "needs_replan", "failed"];
  let verdict: EvaluationVerdict = "complete";
  let reasons: string[] = [];
  let missingCriteria: string[] | undefined;
  let confidence: number | undefined;
  let suggestedAction: string | undefined;

  if (useJsonBlock) {
    const blockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = blockMatch ? blockMatch[1].trim() : content.trim();
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      const v = obj.verdict;
      if (typeof v === "string" && verdicts.includes(v as EvaluationVerdict)) {
        verdict = v as EvaluationVerdict;
      }
      if (Array.isArray(obj.reasons)) {
        reasons = obj.reasons.filter((r): r is string => typeof r === "string");
      } else if (typeof obj.reasons === "string") {
        reasons = [obj.reasons];
      }
      if (Array.isArray(obj.missingCriteria)) {
        missingCriteria = obj.missingCriteria.filter((m): m is string => typeof m === "string");
      }
      if (typeof obj.confidence === "number") confidence = obj.confidence;
      if (typeof obj.suggestedAction === "string") suggestedAction = obj.suggestedAction;
    } catch {
      reasons = ["Could not parse model JSON; treating as complete"];
    }
  } else {
    const lineMap: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (key && value) lineMap[key.trim().toUpperCase()] = value;
    }
    const v = lineMap["VERDICT"]?.toLowerCase();
    if (v && verdicts.includes(v as EvaluationVerdict)) verdict = v as EvaluationVerdict;
    if (lineMap["REASONS"]) reasons = [lineMap["REASONS"]];
    if (lineMap["MISSING_CRITERIA"]) missingCriteria = [lineMap["MISSING_CRITERIA"]];
    if (lineMap["CONFIDENCE"]) confidence = parseFloat(lineMap["CONFIDENCE"]);
    if (lineMap["SUGGESTED_ACTION"]) suggestedAction = lineMap["SUGGESTED_ACTION"];
  }

  if (reasons.length === 0) reasons = [verdict === "complete" ? "Criteria satisfied" : "See verdict"];

  return {
    stepId,
    attempt,
    verdict,
    reasons,
    missingCriteria,
    confidence,
    suggestedAction,
  };
}

/**
 * Creates a step evaluator that uses the given model to judge whether a step
 * attempt satisfies the step's completion criteria. Works with any ModelAdapter
 * (OpenAI, Anthropic, Gemini, or custom).
 */
export function createLLMEvaluator(
  model: ModelAdapter,
  options: LLMEvaluatorOptions = {}
): StepEvaluator {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return {
    async evaluate(input: StepEvaluationInput): Promise<EvaluationResult> {
      const prompt = buildPrompt(input, opts);
      const out = await model.generate({ prompt });
      const content = (out.content ?? "").trim();
      if (!content) {
        return {
          stepId: input.step.id,
          attempt: input.attemptResult.attempt,
          verdict: "retry",
          reasons: ["Model returned no content for evaluation"],
        };
      }
      return parseResponse(
        content,
        input.step.id,
        input.attemptResult.attempt,
        opts.useJsonBlock
      );
    },
  };
}
