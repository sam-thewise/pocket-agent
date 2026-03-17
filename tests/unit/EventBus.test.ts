import { describe, it, expect } from "vitest";
import { EventBus } from "../../src/events/EventBus.js";

describe("EventBus", () => {
  it("on + emit invokes handler with payload", () => {
    const bus = new EventBus();
    let received: unknown;
    bus.on("run.started", (event) => {
      received = event;
    });
    bus.emit("run.started", { runId: "r1" });
    expect(received).toBeDefined();
    expect((received as { runId: string }).runId).toBe("r1");
    expect((received as { type: string }).type).toBe("run.started");
    expect((received as { timestamp: string }).timestamp).toBeDefined();
  });

  it("multiple handlers for same event all run", () => {
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    bus.on("step.completed", () => { a++; });
    bus.on("step.completed", () => { b++; });
    bus.emit("step.completed", { runId: "r1", stepId: "s1", attempt: 1, outputs: {} });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("emit with no listeners does not throw", () => {
    const bus = new EventBus();
    expect(() => bus.emit("run.failed", { runId: "r1" })).not.toThrow();
  });
});
