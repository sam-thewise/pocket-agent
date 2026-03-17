import { describe, it, expect } from "vitest";
import { validatePlan, assertValidPlan } from "../../src/planner/PlanValidator.js";
import { makeMinimalPlan } from "../helpers/stubs.js";
import { PlanningFailureError } from "../../src/types/errors.js";

describe("PlanValidator", () => {
  it("accepts a valid plan", () => {
    const plan = makeMinimalPlan([
      { id: "a", outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "b", dependencies: ["a"], outputs: ["y"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate step id", () => {
    const plan = makeMinimalPlan([
      { id: "same", outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "same", outputs: ["y"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("rejects dependency on non-existent step", () => {
    const plan = makeMinimalPlan([
      { id: "a", dependencies: ["missing"], outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.errors.some((e) => e.includes("dependency") && e.includes("missing"))).toBe(true);
  });

  it("rejects cycle in dependencies", () => {
    const plan = makeMinimalPlan([
      { id: "a", dependencies: ["b"], outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
      { id: "b", dependencies: ["a"], outputs: ["y"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("rejects missing retryPolicy", () => {
    const plan = makeMinimalPlan([
      { id: "a", outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    (plan.steps[0] as { retryPolicy?: unknown }).retryPolicy = undefined;
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.errors.some((e) => e.includes("retryPolicy"))).toBe(true);
  });

  it("rejects empty outputs", () => {
    const plan = makeMinimalPlan([
      { id: "a", outputs: [], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.errors.some((e) => e.includes("outputs"))).toBe(true);
  });

  it("assertValidPlan throws PlanningFailureError for invalid plan", () => {
    const plan = makeMinimalPlan([
      { id: "a", dependencies: ["missing"], outputs: ["x"], retryPolicy: { maxAttempts: 1, strategy: "fail" } },
    ]);
    expect(() => assertValidPlan(plan)).toThrow(PlanningFailureError);
  });
});
