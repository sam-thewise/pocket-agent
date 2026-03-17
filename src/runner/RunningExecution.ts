/**
 * Event-driven execution handle (spec §23.3).
 */

import type { RunResult } from "../types/run.js";
import type { RunState } from "../types/run.js";
import type { EventName } from "../types/events.js";
import type { AgentRunnerEvent } from "../types/events.js";

export interface RunningExecution {
  runId: string;
  result: Promise<RunResult>;
  on(eventName: EventName, handler: (event: AgentRunnerEvent) => void): void;
  getState(): RunState;
}
