/**
 * Fluent helpers to define steps and build plans with minimal syntax.
 */

import type { Plan, StepDefinition, StepType, StepInputRef, RetryPolicy } from "../types/plan.js";
import { nowISO } from "../utils/time.js";

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 2,
  strategy: "retry_with_feedback",
};

export interface StepBuilderOptions {
  type?: StepType;
  retryPolicy?: RetryPolicy;
}

/**
 * Fluent step builder. Chain methods then call .build() to get a StepDefinition.
 *
 * @example
 * step("find_doc", "Find document")
 *   .objective("Locate the latest contract.")
 *   .outputs("path")
 *   .inputsFromContext("customerId")
 *   .build()
 */
export function step(id: string, name: string, options: StepBuilderOptions = {}): StepBuilder {
  return new StepBuilder(id, name, options);
}

class StepBuilder {
  private def: Partial<StepDefinition> & { id: string; name: string };
  private inputRefs: StepInputRef[] = [];

  constructor(
    id: string,
    name: string,
    private options: StepBuilderOptions = {}
  ) {
    this.def = {
      id,
      name,
      type: options.type ?? "transform",
      objective: "",
      dependencies: [],
      allowedTools: [],
      inputs: [],
      outputs: [],
      completionCriteria: [],
      retryPolicy: options.retryPolicy ?? DEFAULT_RETRY,
    };
  }

  objective(text: string): this {
    this.def.objective = text;
    return this;
  }

  outputs(...keys: string[]): this {
    this.def.outputs = keys.length ? keys : ["output"];
    if (!this.def.completionCriteria?.length) {
      this.def.completionCriteria = this.def.outputs.map((k) => `Output "${k}" is produced.`);
    }
    return this;
  }

  dependsOn(...stepIds: string[]): this {
    this.def.dependencies = stepIds;
    return this;
  }

  /** Add input from run context: { source: "runContext", key } */
  inputsFromContext(...keys: string[]): this {
    for (const key of keys) {
      this.inputRefs.push({ source: "runContext", key });
    }
    return this;
  }

  /** Add input from a previous step's output: { source: "stepOutput", stepId, key } */
  inputsFromStep(stepId: string, key: string): this {
    this.inputRefs.push({ source: "stepOutput", stepId, key });
    return this;
  }

  type(t: StepType): this {
    this.def.type = t;
    return this;
  }

  /** Allow these tools for this step (for type "tool"). */
  tools(...toolNames: string[]): this {
    this.def.allowedTools = toolNames;
    return this;
  }

  completionCriteria(...criteria: string[]): this {
    this.def.completionCriteria = criteria;
    return this;
  }

  retry(maxAttempts: number, strategy: RetryPolicy["strategy"] = "retry_with_feedback"): this {
    this.def.retryPolicy = { maxAttempts, strategy };
    return this;
  }

  build(): StepDefinition {
    this.def.inputs = this.inputRefs.length ? this.inputRefs : this.def.inputs ?? [];
    if (!this.def.outputs?.length) this.def.outputs = ["output"];
    if (!this.def.completionCriteria?.length) {
      this.def.completionCriteria = this.def.outputs.map((k) => `Output "${k}" is produced.`);
    }
    return this.def as StepDefinition;
  }
}

export interface BuildPlanOptions {
  planId?: string;
  version?: number;
}

/**
 * Build a Plan from a goal and an array of steps (from step().build() or plain StepDefinition).
 */
export function buildPlan(
  goal: string,
  steps: StepDefinition[],
  options: BuildPlanOptions = {}
): Plan {
  return {
    id: options.planId ?? "plan-1",
    version: options.version ?? 1,
    goal,
    steps,
    createdAt: nowISO(),
  };
}
