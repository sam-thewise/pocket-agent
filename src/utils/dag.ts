/**
 * DAG utilities for plan steps: ready steps, cycle detection, topological order.
 */

import type { StepDefinition } from "../types/plan.js";

/**
 * Returns step IDs that have all dependencies satisfied (in completedStepIds).
 * Steps with no dependencies are ready when completedStepIds is empty.
 */
export function getReadySteps(
  steps: StepDefinition[],
  completedStepIds: Set<string>
): string[] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const ready: string[] = [];
  for (const step of steps) {
    const deps = step.dependencies ?? [];
    const allSatisfied = deps.every((depId) => completedStepIds.has(depId));
    if (allSatisfied) {
      ready.push(step.id);
    }
  }
  return ready;
}

/**
 * Detects if the step graph has a cycle. Returns true if cycle exists.
 */
export function hasCycle(steps: StepDefinition[]): boolean {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const stack = new Set<string>();

  function visit(id: string): boolean {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    const step = stepMap.get(id);
    if (step) {
      for (const depId of step.dependencies ?? []) {
        if (visit(depId)) return true;
      }
    }
    stack.delete(id);
    return false;
  }

  for (const step of steps) {
    if (visit(step.id)) return true;
  }
  return false;
}

/**
 * Topological sort of step IDs. Throws if cycle detected.
 */
export function topologicalSort(steps: StepDefinition[]): string[] {
  if (hasCycle(steps)) {
    throw new Error("Plan contains a cycle in step dependencies");
  }
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const step = stepMap.get(id);
    if (step) {
      for (const depId of step.dependencies ?? []) {
        visit(depId);
      }
    }
    result.push(id);
  }

  for (const step of steps) {
    visit(step.id);
  }
  return result;
}
