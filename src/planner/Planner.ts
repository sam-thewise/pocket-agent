/**
 * Planner contract (spec §10).
 */

import type { Plan } from "../types/plan.js";
import type { PlannerInput, ReplanInput } from "../types/planner.js";

export interface Planner {
  createPlan(input: PlannerInput): Promise<Plan>;
  replan(input: ReplanInput): Promise<Plan>;
}
