/**
 * Unique ID generation for runs and steps.
 */

import { randomUUID } from "node:crypto";

export function createRunId(): string {
  return randomUUID();
}

export function createStepId(prefix = "step"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
