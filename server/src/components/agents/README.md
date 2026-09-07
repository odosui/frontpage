# Agents

- `definitions/`: agent instructions, tool selection, step limits, run titles,
  and the registry (`index.ts`). `shared.ts` holds common instructions.
- `runtime/`: automated runs, chat continuation, context loading, system-message
  assembly, and tool-call parsing and execution.
- `tools/`: available tool implementations and their descriptions.
- `types.ts`: contracts shared by definitions, runtime, and tools.

To add an agent, create its definition and register it in `definitions/index.ts`.
The runtime accepts an `AgentDefinition` and does not select concrete agents.
Jobs and API handlers select a definition, then pass it to the runtime.

Tests live beside the code they exercise. Run `npm test --prefix server` and
`npm run check-types --prefix server` from the repository root.
