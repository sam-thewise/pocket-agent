# API key and local models

The **OpenAI example** (`npm run example:openai`) auto-detects the provider from env: **openai** (cloud), **ollama** (local), or **lmstudio** (local). Set the env vars below, then run the example.

## Cloud (OpenAI)

1. Get an API key from [OpenAI API keys](https://platform.openai.com/api-keys).
2. Set it in the environment (don’t put it in code):
   - **Windows (PowerShell):** `$env:OPENAI_API_KEY = "sk-..."`
   - **Mac/Linux:** `export OPENAI_API_KEY=sk-...`
3. Optional model (default `gpt-4o-mini`): `export OPENAI_MODEL=gpt-4o`
4. Run: `npm install && npm run example:openai`

## Local: Ollama

1. Start Ollama (`ollama serve`, `ollama pull llama3`).
2. Run: `npm run example:openai` (auto-detects ollama from `OPENAI_BASE_URL` containing `11434`, or set `POCKET_AGENT_PROVIDER=ollama`). Defaults: `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_MODEL=llama3`. No API key needed.
3. Optional streaming: set `OLLAMA_USE_STREAMING=1`. See [Ollama streaming](https://docs.ollama.com/capabilities/streaming).

## Local: LM Studio

1. Start LM Studio and run the local server (OpenAI-compatible).
2. Set base URL and model (optional): `export OPENAI_BASE_URL=http://localhost:1234/v1 OPENAI_MODEL=local`
3. Optional native streaming: set `USE_LM_STUDIO_STREAMING=1`. See [LM Studio streaming](https://lmstudio.ai/docs/developer/rest/streaming-events).
4. Run: `npm run example:openai`

## Using tools (list files, read files)

The OpenAI example includes **project tools**: `list_directory`, `read_file`, `grep`. Default goal: “Architecturally, how does this project work?” Pass a different goal:

```bash
npm run example:openai -- "What does the PlanValidator do?"
```

Run with `DEBUG=1` to see tool-calling rounds.

## Project planner

Plan the structure of a new project from a short description:

```bash
npm run example:planner -- "A REST API with Express and SQLite for a todo app"
```

Uses the same env as the OpenAI example. See [examples/run-project-planner.ts](https://github.com/sam-thewise/pocket-agent/blob/master/examples/run-project-planner.ts).

You can use `OPENAI_API_URL` instead of `OPENAI_BASE_URL`, and `MODEL` instead of `OPENAI_MODEL`. See [.env.example](https://github.com/sam-thewise/pocket-agent/blob/master/.env.example) for a full list.

[← Back to README](https://github.com/sam-thewise/pocket-agent/blob/master/README.md)
