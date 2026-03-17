/**
 * Super quick start from the README: one-call agent, goal-only, no steps defined.
 * Set OPENAI_API_KEY (or use another provider) then: npm run example:quick-start
 */

import { createQuickAgent } from "../src/quickStart.js";

const runner = createQuickAgent({ provider: "openai" });
const run = await runner.run({
  goal: "What is 2+2? Explain in one sentence.",
});

console.log("Goal:", run.plan.goal);
console.log("Steps:", run.plan.steps.map((s) => s.id));
console.log("Answer:", run.outputs?.answer ?? "(none)");
