/**
 * Tool adapter contract (spec §13).
 */

import type { JsonSchemaLike } from "./plan.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: JsonSchemaLike;
  outputSchema?: JsonSchemaLike;
}

export interface ToolInvocationContext {
  runId: string;
  stepId: string;
  attempt: number;
  [key: string]: unknown;
}

export interface ToolAdapter {
  definition: ToolDefinition;
  invoke(input: unknown, context: ToolInvocationContext): Promise<unknown>;
}
