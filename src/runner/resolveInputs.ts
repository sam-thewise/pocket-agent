/**
 * Resolves step inputs from run context and prior step outputs (spec §5.2).
 */

import type { StepInputRef } from "../types/plan.js";
import type { StepRunRecord } from "../types/step.js";

export function resolveInputs(
  inputs: StepInputRef[],
  runContext: Record<string, unknown>,
  steps: Record<string, StepRunRecord>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const ref of inputs) {
    let value: unknown;
    if (ref.source === "runContext") {
      value = runContext[ref.key];
    } else if (ref.source === "stepOutput" && ref.stepId) {
      const record = steps[ref.stepId];
      value = record?.finalOutput ? record.finalOutput[ref.key] : undefined;
    } else if (ref.source === "artifact" && ref.stepId) {
      const record = steps[ref.stepId];
      const artifacts = record?.finalArtifacts ?? [];
      const found = artifacts.find((a) => (a as { key?: string }).key === ref.key || a.id === ref.key);
      value = found ?? undefined;
    } else {
      value = undefined;
    }
    resolved[ref.key] = value;
  }
  return resolved;
}
