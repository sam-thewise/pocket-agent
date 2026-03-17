/**
 * Event payload types (spec §16).
 */

import type { Plan } from "./plan.js";

export interface RunStartedEvent {
  type: "run.started";
  runId: string;
  timestamp: string;
}

export interface PlanCreatedEvent {
  type: "plan.created";
  runId: string;
  plan: Plan;
  timestamp: string;
}

export interface PlanRevisedEvent {
  type: "plan.revised";
  runId: string;
  plan: Plan;
  timestamp: string;
}

export interface StepReadyEvent {
  type: "step.ready";
  runId: string;
  stepId: string;
  timestamp: string;
}

export interface StepStartedEvent {
  type: "step.started";
  runId: string;
  stepId: string;
  attempt: number;
  timestamp: string;
}

export interface StepRetryingEvent {
  type: "step.retrying";
  runId: string;
  stepId: string;
  attempt: number;
  timestamp: string;
}

export interface StepCompletedEvent {
  type: "step.completed";
  runId: string;
  stepId: string;
  attempt: number;
  outputs: Record<string, unknown>;
  timestamp: string;
}

export interface StepBlockedEvent {
  type: "step.blocked";
  runId: string;
  stepId: string;
  timestamp: string;
}

export interface StepFailedEvent {
  type: "step.failed";
  runId: string;
  stepId: string;
  attempt: number;
  error?: unknown;
  timestamp: string;
}

export interface RunCompletedEvent {
  type: "run.completed";
  runId: string;
  outputs: Record<string, unknown>;
  timestamp: string;
}

export interface RunFailedEvent {
  type: "run.failed";
  runId: string;
  error?: unknown;
  timestamp: string;
}

export type AgentRunnerEvent =
  | RunStartedEvent
  | PlanCreatedEvent
  | PlanRevisedEvent
  | StepReadyEvent
  | StepStartedEvent
  | StepRetryingEvent
  | StepCompletedEvent
  | StepBlockedEvent
  | StepFailedEvent
  | RunCompletedEvent
  | RunFailedEvent;

export const EVENT_NAMES = [
  "run.started",
  "plan.created",
  "plan.revised",
  "step.ready",
  "step.started",
  "step.retrying",
  "step.completed",
  "step.blocked",
  "step.failed",
  "run.completed",
  "run.failed",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
