/**
 * Optional JSON-schema validation helpers for step outputs (v1: minimal).
 */

import type { JsonSchemaLike } from "../types/plan.js";

/**
 * Stub: in v1 we do not validate against JSON schema by default.
 * Can be extended to use a small library (e.g. ajv) if requireStructuredOutputs is used.
 */
export function validateOutput(
  _output: unknown,
  _schema: JsonSchemaLike
): { valid: true } | { valid: false; errors: string[] } {
  return { valid: true };
}
