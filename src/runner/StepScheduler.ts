/**
 * Determines which steps are ready to run (spec §6.1, §7.3, §20).
 */

import type { Plan } from "../types/plan.js";
import type { StepRunRecord } from "../types/step.js";
import type { RunOptions } from "../types/run.js";

const TERMINAL_STATUSES = new Set<string>(["completed", "failed", "blocked", "skipped"]);
const SCHEDULABLE_STATUSES = new Set<string>(["pending", "ready"]);

/**
 * Returns step IDs that are ready: dependencies satisfied and status is pending/ready.
 * Respects maxParallelSteps (v1: default 1 = sequential).
 */
export function getReadyStepIds(
  plan: Plan,
  stepRecords: Record<string, StepRunRecord>,
  options: RunOptions
): string[] {
  const completedOrTerminal = new Set<string>();
  for (const [id, record] of Object.entries(stepRecords)) {
    if (record.status === "completed" || record.status === "failed" || record.status === "blocked" || record.status === "skipped") {
      completedOrTerminal.add(id);
    }
  }

  const dependencySatisfied = new Set<string>();
  for (const step of plan.steps) {
    const deps = step.dependencies ?? [];
    const allDone = deps.every((d) => completedOrTerminal.has(d));
    if (allDone) {
      dependencySatisfied.add(step.id);
    }
  }

  const ready: string[] = [];
  for (const step of plan.steps) {
    if (!dependencySatisfied.has(step.id)) continue;
    const record = stepRecords[step.id];
    const status = record?.status ?? "pending";
    if (record?.status === "running" || record?.status === "retrying") continue;
    if (TERMINAL_STATUSES.has(status)) continue;
    if (SCHEDULABLE_STATUSES.has(status)) {
      ready.push(step.id);
    }
  }

  const max = options.maxParallelSteps ?? 1;
  return ready.slice(0, max);
}
