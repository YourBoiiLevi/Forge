# Spec 11 — Agent Core

> Fork of `badlogic/pi-mono`'s `pi-ai` and `pi-agent-core` packages, adapted for Forge.

## 1. Overview

Forge forks two packages from the [badlogic/pi-mono](https://github.com/badlogic/pi-mono) monorepo:

| Upstream package | Upstream path | Forge package | Purpose |
|---|---|---|---|
| `@mariozechner/pi-ai` | `packages/ai/` | `forge-ai` | Unified LLM API layer across 20+ providers |
| `@mariozechner/pi-agent-core` | `packages/agent/` | `forge-agent` | Agent loop with inner/outer loop, steering/follow-up queues, events |

A third Forge-only package, `forge-tools`, extracts and adapts the coding tools from `packages/coding-agent/core/tools/`. A fourth, `forge-orchestrator`, houses executor logic, Captain orchestration, and agent spawning.

### Fork philosophy

- **pi-ai**: Keep everything. Zero behavioral changes. Rename the package, update imports.
- **pi-agent-core**: Keep everything. Zero behavioral changes. Extend via declaration merging and callbacks.
- **coding-agent tools**: Cherry-pick tool implementations, strip TUI/extension coupling, add E2B pluggability.
- **Everything else in pi-mono**: Strip entirely.

---

## 2. pi-ai — What to Keep (EVERYTHING)

The entire `packages/ai/` directory is forked as `forge-ai` with no functional modifications beyond renaming.

### 2.1 Unified LLM API abstraction

Full provider support across:

| Provider | Module | Notes |
|---|---|---|
| OpenAI | `providers/openai-completions.ts`, `providers/openai-responses.ts` | Both completions and responses APIs |
| Anthropic (Claude) | `providers/anthropic.ts` | |
| Google Generative AI (Gemini) | `providers/google.ts` | |
| Google Vertex AI | `providers/google-vertex.ts` | |
| Amazon Bedrock | `providers/amazon-bedrock.ts` | |
| Mistral | Provider registration | |
| xAI (Grok) | Provider registration | |
| Groq | Provider registration | |
| Cerebras | Provider registration | |
| OpenRouter | Provider registration | |
| Custom OpenAI-compatible | Configurable base URL | |

### 2.2 Model registry system

- `KnownProvider` — String literal union of supported provider names.
- `KnownApi` — String literal union of supported API types (e.g. `"openai-completions"`, `"anthropic"`, `"google"`).
- `Model<TApi>` — Generic type parameterized by API type for compile-time safety.
- `models.generated.ts` — Auto-generated registry of known models, their providers, APIs, context windows, and pricing.

### 2.3 Message types

- `UserMessage` — Text, images, tool results.
- `AssistantMessage` — Text, thinking blocks, tool calls.
- `ToolResultMessage` — Tool execution results.

### 2.4 Tool system

- `Tool<TParameters>` — Tool definition with TypeBox schema for parameters.
- TypeBox (`@sinclair/typebox`) for declarative JSON Schema generation.
- `validateToolArguments` — Runtime validation via AJV against the TypeBox schema.

### 2.5 Streaming events

`AssistantMessageEvent` discriminated union:

| Event | Description |
|---|---|
| `start` | Stream opened |
| `text_start` | Text block begins |
| `text_delta` | Incremental text chunk |
| `text_end` | Text block complete |
| `thinking_start` | Thinking/reasoning block begins |
| `thinking_delta` | Incremental thinking chunk |
| `thinking_end` | Thinking block complete |
| `toolcall_start` | Tool call begins (name, id) |
| `toolcall_delta` | Incremental tool call arguments |
| `toolcall_end` | Tool call complete |
| `done` | Stream finished, full message available |
| `error` | Stream error |

### 2.6 API provider registry

- `ApiProvider` — Interface for provider implementations.
- `registerApiProvider(name, factory)` — Register a provider at startup.
- `getApiProvider(name)` — Retrieve a registered provider by name.

Provider implementations live in `providers/` and are registered on import.

### 2.7 Advanced features

- **Thinking/reasoning support**: `streamSimple` accepts a reasoning level to enable extended thinking on supported providers (Claude, Gemini).
- **Cost tracking**: `calculateCost(model, usage)` computes input/output/total cost from token counts and model pricing data.
- **Partial JSON parsing**: Streaming tool call arguments are parsed incrementally via `partial-json` so tools can show progress before the full arguments arrive.
- **Cross-provider handoffs**: When switching models mid-conversation, thinking blocks from one provider are converted to a format the new provider understands (e.g. Anthropic thinking blocks → text blocks for OpenAI).

### 2.8 Dependencies (all kept)

```
@anthropic-ai/sdk
@aws-sdk/client-bedrock-runtime
@google/genai
@mistralai/mistralai
@sinclair/typebox
ajv
openai
partial-json
proxy-agent
undici
```

---

## 3. pi-agent-core — What to Keep (EVERYTHING)

The entire `packages/agent/` directory is forked as `forge-agent` with no functional modifications.

### 3.1 Agent class

High-level API for managing the agent lifecycle.

#### Lifecycle methods

| Method | Description |
|---|---|
| `prompt(message)` | Send a user message; starts the agent loop |
| `continue()` | Resume the loop (e.g. after external events) |
| `abort()` | Cancel the current stream and stop the loop |
| `waitForIdle()` | Returns a promise that resolves when the agent finishes all work |

#### State access

- `state` — Returns the current `AgentState` (read-only snapshot).

#### State mutations

| Method | Description |
|---|---|
| `setSystemPrompt(prompt)` | Replace the system prompt |
| `setModel(model)` | Switch the LLM model |
| `setThinkingLevel(level)` | Set reasoning effort (none, low, medium, high) |
| `setTools(tools)` | Replace the tool set |
| `replaceMessages(messages)` | Replace the full message history |
| `appendMessage(message)` | Append a message to history |
| `clearMessages()` | Clear all messages |
| `reset()` | Full reset: clear messages, error, streaming state |

#### Steering and follow-up

| Method | Description |
|---|---|
| `steer(message)` | Inject a steering message that interrupts the current turn |
| `followUp(message)` | Queue a message to be sent after the current turn completes |
| `hasQueuedMessages()` | Check if steering or follow-up messages are pending |
| Clear queue methods | Clear steering queue, follow-up queue, or both |

Queue modes control how steering/follow-up messages are consumed (single, batch, drain).

#### Events

- `subscribe(fn)` — Register an event listener. Returns an `unsubscribe` function.

#### Session

- `sessionId` — Unique identifier for the agent session.
- `thinkingBudgets` — Per-model thinking token budgets.

### 3.2 AgentMessage type system

#### Standard LLM messages

`AgentMessage` wraps the pi-ai message types (`UserMessage`, `AssistantMessage`, `ToolResultMessage`) and adds custom message support.

#### Custom messages via declaration merging

Third-party code (like Forge) extends the message type system without modifying the core package:

```typescript
declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    heartbeat: {
      role: "heartbeat";
      taskId: string;
      uptimeSeconds: number;
      timestamp: number;
    };
    walkthrough: {
      role: "walkthrough";
      data: WalkthroughData;
      timestamp: number;
    };
  }
}
```

Custom messages are stored in the message history but filtered out at the LLM boundary via `convertToLlm()`.

### 3.3 AgentState

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool[];
  messages: AgentMessage[];
  isStreaming: boolean;
  streamMessage: AssistantMessage | null;
  pendingToolCalls: ToolCall[];
  error: Error | null;
}
```

### 3.4 AgentTool

Extends `Tool<TParameters>` with:

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Human-readable name for the tool |
| `execute` | `(args, updateCallback) => Promise<AgentToolResult>` | Execution function |
| `AgentToolResult` | `{ result: string }` or `{ error: string }` | Tool output |
| `AgentToolUpdateCallback` | `(update: string) => void` | Streaming progress callback (e.g. bash output lines) |

### 3.5 Inner/outer loop (`agent-loop.ts`)

The core execution engine:

```
OUTER LOOP: while follow-up messages are queued
│
├── Dequeue follow-up messages → append to history
│
└── INNER LOOP: while there is work to do
    │
    ├── 1. Check steering queue → if messages, inject and restart inner loop
    ├── 2. Stream assistant response from LLM
    ├── 3. If tool calls in response:
    │   ├── Execute each tool sequentially
    │   ├── After EACH tool: check steering queue
    │   │   └── If steering arrived, skip remaining tools, restart inner loop
    │   └── Append tool results to history
    └── 4. If no tool calls → inner loop ends, check outer loop
```

Key behaviors:

- **Steering interrupts mid-turn**: If a steering message arrives while tools are executing, remaining tool calls are skipped. The steering message is injected and the inner loop restarts.
- **Follow-up messages are post-turn**: They are only consumed when the agent is idle (inner loop finished). This makes them safe for queuing work without disrupting current execution.
- **Tool execution is sequential**: Tools within a single assistant response run one at a time, in order.

### 3.6 AgentLoopConfig

Configuration callbacks that decouple the loop from external concerns:

| Callback | Description |
|---|---|
| `transformContext` | Modify the message array before sending to LLM (e.g. truncation, summarization) |
| `convertToLlm` | Convert `AgentMessage[]` to LLM-compatible messages (strips custom messages) |
| `getApiKey` | Resolve API key for the current provider (async, may fetch from vault) |
| `getSteeringMessages` | Drain the steering queue |
| `getFollowUpMessages` | Drain the follow-up queue |

### 3.7 AgentEvent types

Discriminated union of lifecycle events:

| Event | Description |
|---|---|
| `agent_start` | Agent loop begins |
| `agent_end` | Agent loop ends (idle) |
| `turn_start` | Inner loop iteration begins |
| `turn_end` | Inner loop iteration ends |
| `message_start` | LLM streaming begins |
| `message_update` | Incremental stream update (text delta, tool call delta) |
| `message_end` | LLM streaming complete |
| `tool_execution_start` | Tool begins executing |
| `tool_execution_update` | Tool progress update (via `AgentToolUpdateCallback`) |
| `tool_execution_end` | Tool execution complete |

### 3.8 EventStream

`EventStream` implements `AsyncIterable<AgentEvent>`, allowing consumers to process events with `for await...of`:

```typescript
for await (const event of agent.events) {
  switch (event.type) {
    case "message_update":
      // forward to NDJSON stream
      break;
    case "tool_execution_end":
      // log tool result
      break;
  }
}
```

### 3.9 Low-level functions

For cases where the `Agent` class is too high-level:

- `agentLoop(config)` — Run the full outer+inner loop as a standalone function.
- `agentLoopContinue(config)` — Resume a loop from existing state.

### 3.10 Dependency

`forge-agent` depends only on `forge-ai`. No other runtime dependencies.

---

## 4. From coding-agent — What to Extract & Modify

Tools are extracted from `packages/coding-agent/core/tools/` into `forge-tools`.

### 4.1 Tools to extract

| Source file | Forge tool | Modifications |
|---|---|---|
| `bash.ts` | `BashTool` | Keep `BashOperations` interface; strip TUI rendering (`renderCall`, `renderResult`) |
| `read.ts` | `ReadTool` | Strip TUI rendering; adapt for E2B sandbox filesystem |
| `write.ts` | `WriteTool` | Strip TUI rendering; adapt for E2B sandbox filesystem |
| `edit.ts` | `EditTool` | Strip TUI rendering; keep diff-based editing logic |
| `find.ts` | `FindTool` | Strip TUI rendering; adapt for E2B sandbox filesystem |
| `grep.ts` | `GrepTool` | Strip TUI rendering; adapt for E2B sandbox filesystem |
| `ls.ts` | `LsTool` | Strip TUI rendering; adapt for E2B sandbox filesystem |
| `truncate.ts` | (utility) | Keep as internal utility for output truncation |

### 4.2 What to strip from each tool

- `renderCall(args)` — TUI-specific call rendering. Remove entirely.
- `renderResult(result)` — TUI-specific result rendering. Remove entirely.
- Extension hooks — Any code that checks for or invokes the extension system. Remove.
- Session manager references — Replace with direct config/state access.

### 4.3 What to keep from each tool

- **Core logic**: The actual tool implementation (file reading, process spawning, diffing).
- **TypeBox schemas**: Parameter definitions using `@sinclair/typebox`.
- **Validation**: Argument validation logic.
- **Error handling**: Error messages and edge case handling.

### 4.4 Tool pluggability pattern — BashOperations

The `BashOperations` interface decouples bash execution from the runtime environment:

```typescript
interface BashOperations {
  execute(command: string, options?: { timeout?: number; cwd?: string }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}
```

Implementations:

| Implementation | Runtime | Usage |
|---|---|---|
| Node.js `child_process` | Local development | Default for local agents |
| `sandbox.commands.run()` | E2B cloud sandbox | Production agents running in sandboxes |
| `just-bash` `Bash` class | Lightweight subprocess | Used by `plan_*` tools that need minimal bash |

The same pattern extends to filesystem operations for `ReadTool`, `WriteTool`, `FindTool`, `GrepTool`, and `LsTool`:

```typescript
interface FileOperations {
  read(path: string, range?: [number, number]): Promise<string>;
  write(path: string, content: string): Promise<void>;
  list(path: string): Promise<string[]>;
  find(pattern: string, options?: { cwd?: string }): Promise<string[]>;
  grep(pattern: string, options?: { path?: string; glob?: string }): Promise<GrepMatch[]>;
}
```

---

## 5. What to Strip Entirely

Everything in `pi-mono` not covered in sections 2–4 is excluded from the fork.

### 5.1 coding-agent subsystems

| Path | Component | Why stripped |
|---|---|---|
| `packages/coding-agent/cli/` | CLI argument parsing | Forge agents are spawned programmatically, not via CLI |
| `packages/coding-agent/modes/interactive/` | TUI interactive mode | Forge has no terminal UI |
| `packages/coding-agent/core/extensions/` | Extension system | Deeply coupled to TUI (~1279 lines); Forge uses its own tool registration |
| `packages/coding-agent/core/session-manager.ts` | Session tree management | Forge manages sessions via executor/orchestrator |
| `packages/coding-agent/core/settings-manager.ts` | Config persistence | Forge uses environment variables and spawn-time config |
| `packages/coding-agent/core/compaction/` | Context compaction | May add later if needed; not in initial fork |
| `packages/coding-agent/core/export-html/` | HTML export | Not applicable to Forge |
| `packages/coding-agent/core/auth-storage.ts` | Credential management | Forge resolves keys via `getApiKey` callback |
| `packages/coding-agent/core/prompt-templates.ts` | System prompt management | Forge defines its own per-agent-type prompts |
| `packages/coding-agent/core/agent-session.ts` | Session-specific wrapper | Replaced by Forge executor logic |

### 5.2 Entire packages

| Path | Component | Why stripped |
|---|---|---|
| `packages/tui/` | Terminal UI library | No TUI in Forge |
| `packages/web-ui/` | Web UI library | Forge has its own frontend |
| `packages/pods/` | vLLM pod management | Not applicable |
| `packages/mom/` | Multi-OM | Not applicable |

---

## 6. Forge-Specific Modifications

### 6.1 Custom AgentMessages

Forge extends the message type system via TypeScript declaration merging:

```typescript
declare module "forge-agent" {
  interface CustomAgentMessages {
    heartbeat: {
      role: "heartbeat";
      taskId: string;
      uptimeSeconds: number;
      timestamp: number;
    };
    walkthrough: {
      role: "walkthrough";
      data: WalkthroughData;
      timestamp: number;
    };
    progress: {
      role: "progress";
      taskId: string;
      phase: string;
      percent: number;
      timestamp: number;
    };
  }
}
```

These messages:
- Are stored in the message history for audit/replay.
- Are stripped by `convertToLlm()` before sending to the LLM.
- Are forwarded as NDJSON events to the executor and API.

### 6.2 Custom tool implementations

Forge-specific tools (not from pi-mono) are defined in `forge-tools`:

- `spawn_agent` — Spawn a child agent via the orchestrator.
- `emit_walkthrough` — Emit a walkthrough message.
- `merge_branches` — Git merge operations.
- `assign_task` — Captain tool for task delegation.
- `submit_result` — Report task completion to the orchestrator.

**Note:** `query_memory` (MCP-based memory queries) is deferred to a future phase.

These tools implement `AgentTool` from `forge-agent`.

### 6.3 Event forwarding

Agent events are forwarded from the `Agent` instance to external consumers:

```
Agent.subscribe(event) → serialize to NDJSON → write to executor stream → API response
```

The executor maps `AgentEvent` types to Forge's NDJSON event format (see spec 08).

### 6.4 System prompts

System prompts are:
- Defined per agent type (Captain, Type 1, Type 2, Type 3, Refinery).
- Configured at spawn time via `agent.setSystemPrompt()`.
- Not managed by pi-agent-core's prompt template system (which is stripped).

### 6.5 Model configuration

- **All agents use the same model**, set via the `FORGE_MODEL` environment variable. There is no per-agent model override.
- The model string is resolved to a `Model<TApi>` via the model registry in `forge-ai`.
- This global-model-only principle ensures consistent behavior and simplifies reasoning about agent capabilities.

### 6.6 API key resolution

The `getApiKey` callback in `AgentLoopConfig` is implemented by Forge to:

1. Check environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).
2. Optionally resolve from a secrets manager or vault.
3. Return the key for the current model's provider.

---

## 7. Package Structure

```
packages/
├── forge-ai/                    # Fork of pi-ai
│   ├── src/
│   │   ├── index.ts             # Public API exports
│   │   ├── types.ts             # Message types, Model<TApi>, KnownProvider, KnownApi
│   │   ├── models.generated.ts  # Auto-generated model registry
│   │   ├── streaming.ts         # AssistantMessageEvent, stream parsing
│   │   ├── tools.ts             # Tool<TParameters>, validateToolArguments
│   │   ├── cost.ts              # calculateCost
│   │   ├── registry.ts          # ApiProvider, registerApiProvider, getApiProvider
│   │   └── providers/
│   │       ├── anthropic.ts
│   │       ├── openai-completions.ts
│   │       ├── openai-responses.ts
│   │       ├── google.ts
│   │       ├── google-vertex.ts
│   │       ├── amazon-bedrock.ts
│   │       └── ...              # Mistral, xAI, Groq, Cerebras, OpenRouter
│   └── package.json
│
├── forge-agent/                 # Fork of pi-agent-core
│   ├── src/
│   │   ├── index.ts             # Public API exports
│   │   ├── agent.ts             # Agent class
│   │   ├── agent-loop.ts        # Inner/outer loop implementation
│   │   ├── types.ts             # AgentState, AgentMessage, AgentTool, AgentEvent
│   │   ├── event-stream.ts      # EventStream async iterable
│   │   └── custom-messages.ts   # CustomAgentMessages interface, convertToLlm
│   └── package.json
│
├── forge-tools/                 # Extracted tools + Forge-specific tools
│   ├── src/
│   │   ├── index.ts
│   │   ├── operations.ts        # BashOperations, FileOperations interfaces
│   │   ├── coding/              # Extracted from coding-agent
│   │   │   ├── bash.ts
│   │   │   ├── read.ts
│   │   │   ├── write.ts
│   │   │   ├── edit.ts
│   │   │   ├── find.ts
│   │   │   ├── grep.ts
│   │   │   ├── ls.ts
│   │   │   └── truncate.ts
│   │   └── forge/               # Forge-specific tools
│   │       ├── spawn-agent.ts
│   │       ├── emit-walkthrough.ts
│   │       ├── merge-branches.ts
│   │       ├── assign-task.ts
│   │       └── submit-result.ts
│   │       # Note: query-memory.ts is deferred (MCP not in MVP)
│   └── package.json
│
└── forge-orchestrator/          # Executor, Captain, agent spawning
    ├── src/
    │   ├── index.ts
    │   ├── executor.ts          # Agent process management
    │   ├── captain.ts           # Orchestration agent
    │   ├── spawner.ts           # Agent factory
    │   └── event-bridge.ts      # AgentEvent → NDJSON forwarding
    └── package.json
```

---

## 8. TypeScript Patterns to Preserve

### 8.1 Generic types for API safety

```typescript
type Model<TApi extends KnownApi> = {
  provider: KnownProvider;
  api: TApi;
  name: string;
  contextWindow: number;
};

// Compile-time enforcement: can't pass an Anthropic model to an OpenAI-only function
function streamOpenAI(model: Model<"openai-completions">, ...): AsyncIterable<...> { ... }
```

### 8.2 Declaration merging for extensibility

```typescript
// In forge-agent (empty interface, ready for merging)
interface CustomAgentMessages {}

// In Forge application code (extends without modifying core)
declare module "forge-agent" {
  interface CustomAgentMessages {
    heartbeat: { role: "heartbeat"; /* ... */ };
  }
}

// AgentMessage automatically includes the new type
type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage
  | CustomAgentMessages[keyof CustomAgentMessages];
```

### 8.3 Discriminated unions for event narrowing

```typescript
type AgentEvent =
  | { type: "agent_start"; sessionId: string }
  | { type: "turn_start"; turnIndex: number }
  | { type: "message_update"; delta: string }
  | { type: "tool_execution_end"; toolName: string; result: AgentToolResult }
  | { type: "agent_end"; reason: "idle" | "aborted" | "error" };

// Exhaustive switch with type narrowing
function handle(event: AgentEvent) {
  switch (event.type) {
    case "agent_start": /* event.sessionId is string */ break;
    case "tool_execution_end": /* event.toolName is string */ break;
    // ...
  }
}
```

### 8.4 TypeBox for tool parameter schemas

```typescript
import { Type, Static } from "@sinclair/typebox";

const BashParams = Type.Object({
  command: Type.String({ description: "The bash command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
});

type BashParams = Static<typeof BashParams>;

const bashTool: AgentTool = {
  name: "bash",
  label: "Execute Bash Command",
  parameters: BashParams,
  execute: async (args: BashParams, update) => {
    // ...
  },
};
```

### 8.5 Async iteration for EventStream

```typescript
class EventStream implements AsyncIterable<AgentEvent> {
  [Symbol.asyncIterator](): AsyncIterator<AgentEvent> { ... }
}

// Consumer
async function forwardEvents(agent: Agent, output: WritableStream) {
  for await (const event of agent.events) {
    output.write(JSON.stringify(event) + "\n");
  }
}
```

---

## Cross-References

- [05-toolset.md](./05-toolset.md) — Tool interfaces, parameter schemas, per-agent-type tool assignments.
- [04-agent-types.md](./04-agent-types.md) — Agent type definitions, system prompts, tool sets.
- [01-architecture-overview.md](./01-architecture-overview.md) — System architecture, how Agent Core fits into the overall system.
- [08-ndjson-events.md](./08-ndjson-events.md) — NDJSON event format for event forwarding.
