# Event-driven usage

Use `runner.start()` to get an execution handle and subscribe to lifecycle events:

```ts
const execution = runner.start({
  goal: "Read onboarding docs and extract action items",
});

execution.on("plan.created", (event) => {
  console.log(event.plan.steps);
});
execution.on("step.completed", (event) => {
  console.log(event.stepId, event.outputs);
});
execution.on("run.completed", (event) => {
  console.log(event.outputs);
});

const result = await execution.result;
```

Events include: `run.started`, `plan.created`, `step.started`, `step.completed`, `step.retrying`, `step.failed`, `run.completed`, `run.failed`.

[← Back to README](https://github.com/sam-thewise/pocket-agent/blob/master/README.md)
