/**
 * Model adapter contract (spec §14).
 * Provider-agnostic; no specific vendor in core.
 */

export interface ModelGenerateInput {
  prompt?: string;
  messages?: unknown[];
  [key: string]: unknown;
}

export interface ModelGenerateOutput {
  content?: string;
  raw?: unknown;
  [key: string]: unknown;
}

export interface ModelAdapter {
  generate(input: ModelGenerateInput): Promise<ModelGenerateOutput>;
}
