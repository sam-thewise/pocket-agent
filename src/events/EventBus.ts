/**
 * Run-scoped event bus for execution lifecycle events (spec §16).
 */

import type { AgentRunnerEvent, EventName } from "../types/events.js";
import { nowISO } from "../utils/time.js";

type Handler = (event: AgentRunnerEvent) => void;

export class EventBus {
  private listeners = new Map<string, Handler[]>();

  on(eventName: EventName, handler: Handler): void {
    const list = this.listeners.get(eventName) ?? [];
    list.push(handler);
    this.listeners.set(eventName, list);
  }

  emit(eventName: EventName, payload: Record<string, unknown>): void {
    const event = {
      ...payload,
      type: eventName,
      timestamp: nowISO(),
    } as AgentRunnerEvent;
    const list = this.listeners.get(eventName) ?? [];
    for (const h of list) {
      try {
        h(event);
      } catch (_e) {
        // Don't let one listener break others
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
