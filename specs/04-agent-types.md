# 04 — Agent Types and Hierarchy

> Cross-reference: [05-toolset.md](./05-toolset.md) for detailed tool interfaces, [06-sandbox-git.md](./06-sandbox-git.md) for sandbox and git strategy, [08-artifact-schemas.md](./08-artifact-schemas.md) for walkthrough format.

---

## 1. Overview

Forge defines **four agent types** arranged in a strict hierarchy of capability:

| Type | Name | Can Spawn | Emits CRs | Persisted Task List |
|------|------|-----------|-----------|---------------------|
| 1 | Throwaway Agent | — | No | No |
| 2 | Default Worker Agent | Type 1 | No | No |
| 3 | Sub-executor Agent | Type 1, 2 | No | Yes |
| 3R | Refinery Agent (special Type 3 variant) | Type 1, 2, 3 | Yes | Yes |

### Shared Properties

- **Model**: Every agent uses the same LLM model, controlled by a single global environment variable. There is no per-agent model override.
- **Sandbox isolation**: Each agent runs in its own E2B sandbox on its own git branch.
- **pi-agent-core**: All agents are instances of the `pi-agent-core` `Agent` class (forked from `badlogic/pi-mono`). This provides:
  - Inner loop (tool-use cycle) and outer loop (task-level retry/continuation)
  - Steering queue — used for emergency pause / abort signals from the executor
  - Follow-up queue — used for continuation after a sub-agent completes
  - Event-driven architecture — all side-effects are expressed as typed events forwarded over NDJSON

---

## 2. Type 1 — Throwaway Agent

### Purpose

The simplest agent. Executes a single fine-grained task and terminates. Fire and forget — no delegation, no task management.

### Lifecycle

```
Spawned → executes single task → emits walkthrough → terminates
```

1. The executor (or a parent agent) spawns a Type 1 with a task description and a target branch.
2. The agent works autonomously until the task is complete or it determines it cannot proceed.
3. It emits a `walkthrough.md` artifact via `emit_walkthrough`.
4. The sandbox is killed immediately after completion.

### Toolset

| Tool | Description |
|------|-------------|
| `read` | Read file contents from the sandbox filesystem |
| `write` | Write / create files |
| `bash` | Execute shell commands |
| `edit` | Apply structured edits to existing files |
| `web_search` | Search the web for information |
| `web_fetch` | Fetch and read a web page |
| `emit_walkthrough` | Emit the completion walkthrough artifact |

### Constraints

- **Cannot spawn sub-agents.** A Type 1 agent has no `spawn_agent` tool.
- Single-task scoped — there is no task list, no subtask tracking.

### Branch Strategy

- When spawned directly by the executor: `forge/<taskId>/<attemptId>`
- When spawned as a sub-agent by a Type 2 or Type 3: operates on a delegated sub-branch under the parent's branch namespace (e.g., `forge/<parentTaskId>/<attemptId>/<subTaskId>`)

### Sandbox

- Own E2B sandbox instance.
- Sandbox is destroyed after the agent completes (success or failure).
- 1-hour maximum lifetime (with pause/resume support).

---

## 3. Type 2 — Default Worker Agent

### Purpose

The default agent type for most tasks. Decently powerful — can work autonomously on a task and delegate fine-grained subtasks to Type 1 agents.

### Lifecycle

```
Spawned → works on task → may spawn Type 1 sub-agents → emits walkthrough → terminates
```

1. The executor spawns a Type 2 with a task description and a target branch.
2. If the task depends on other tasks (A, B, …), the Type 2 first merges those dependency branches into a new working branch before starting. It may spawn a Type 1 sub-agent to handle the merge if needed.
3. The agent works on the task, optionally delegating fine-grained subtasks to Type 1 agents.
4. Each spawned Type 1 runs in its own sandbox on a sub-branch.
5. When all work is done, the Type 2 emits a `walkthrough.md` and terminates.

### Toolset

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `write` | Write / create files |
| `bash` | Execute shell commands |
| `edit` | Apply structured edits |
| `web_search` | Search the web |
| `web_fetch` | Fetch a web page |
| `emit_walkthrough` | Emit completion walkthrough |
| `spawn_agent(type=1)` | Spawn a Type 1 Throwaway Agent for a subtask |

### Delegation

- Can spawn **Type 1 agents only**.
- Each spawned Type 1 gets its own E2B sandbox and works on a sub-branch.
- The parent Type 2 waits for the sub-agent to complete (via the follow-up queue) before continuing, or may proceed in parallel depending on task structure.

### Dependency Merging

When the executor assigns a task that depends on previously completed tasks A and B:

1. The Type 2 agent receives the dependency branch names.
2. It creates a new merge branch and merges the dependency branches in sequence.
3. If merge conflicts arise, it may spawn a Type 1 sub-agent to resolve them.
4. Work begins only after the merge branch is clean and buildable.

### Branch Strategy

- Primary branch: `forge/<taskId>/<attemptId>`
- Sub-agent branches: `forge/<taskId>/<attemptId>/<subTaskId>`

### Sandbox

- Own E2B sandbox instance, destroyed after completion.
- 1-hour maximum lifetime (with pause/resume support).

---

## 4. Type 3 — Sub-executor Agent

### Purpose

For complex tasks that require further decomposition. A Type 3 agent maintains its own **persisted task list** — a flat, ordered list of subtasks (not a full DAG with specs). It orchestrates Type 1 and Type 2 agents to execute those subtasks.

### Lifecycle

```
Spawned → creates task list → spawns Type 1/2 agents → oversees completion → emits walkthrough → terminates
```

1. The executor (or a Refinery) spawns a Type 3 with a complex task description.
2. The Type 3 analyzes the task and creates a list of subtasks using `add_subtask`.
3. It spawns Type 1 and/or Type 2 agents to execute individual subtasks.
4. It monitors completion, re-plans if subtasks fail, and ensures ordering constraints are met.
5. On completion, it emits a `walkthrough.md` and terminates.

### Toolset

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `write` | Write / create files |
| `bash` | Execute shell commands |
| `edit` | Apply structured edits |
| `web_search` | Search the web |
| `web_fetch` | Fetch a web page |
| `emit_walkthrough` | Emit completion walkthrough |
| `spawn_agent(type=1\|2)` | Spawn Type 1 or Type 2 agents |
| `add_subtask` | Add a subtask to the persisted task list |
| `read_subtasks` | Read the current subtask list and statuses |

### Constraints

- **Cannot spawn other Type 3 agents.** This prevents infinite recursion of sub-executors.
- Cannot emit Change Requests (CRs) — only Refineries can.

### Persisted Task List

The Type 3's task list is stored as artifacts in the centralized store:

```
artifacts/<runId>/<taskId>/subtasks/
├── 001-subtask-a.json
├── 002-subtask-b.json
└── 003-subtask-c.json
```

Each subtask file contains:

```json
{
  "id": "subtask-001",
  "title": "Implement user validation",
  "description": "Add input validation to the user registration endpoint...",
  "status": "PENDING | IN_PROGRESS | DONE | FAILED",
  "assignedAgentType": 1 | 2,
  "agentId": "agent-xyz",
  "order": 1,
  "dependsOn": ["subtask-000"]
}
```

This is **tactical task management** — a flat ordered list with optional lightweight dependency edges. It is explicitly **not** a full DAG with specs like the top-level planner produces.

### Branch Strategy

- Primary branch: `forge/<taskId>/<attemptId>`
- Child agent branches follow the standard naming under this namespace.

### Sandbox

- Own E2B sandbox instance, destroyed after completion.
- 1-hour maximum lifetime (with pause/resume support).

---

## 5. Refinery Agent (Special Type 3 Variant)

### Purpose

A Refinery is a specialized Type 3 agent placed in the DAG by the planner wherever **integration** should happen. It is the quality gate of the system — responsible for merging accumulated branches, running tests, resolving conflicts, and validating combined results before work continues downstream.

### Lifecycle

```
Spawned → merges accumulated branches → runs tests → fixes conflicts
→ validates combined results → may emit CRs → terminates
```

1. The executor spawns the Refinery when its upstream dependencies in the DAG are complete.
2. The Refinery merges the accumulated branches from upstream tasks.
3. It runs the project's test suite and validates the merged result.
4. If conflicts or test failures arise, it spawns sub-agents (Type 1, 2, or 3) to fix them.
5. It may emit **Change Requests (CRs)** back to the main plan if it discovers that upstream work needs revision.
6. On completion, it emits a walkthrough and optionally awaits user permission before the plan continues.

### Toolset

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `write` | Write / create files |
| `bash` | Execute shell commands |
| `edit` | Apply structured edits |
| `web_search` | Search the web |
| `web_fetch` | Fetch a web page |
| `emit_walkthrough` | Emit completion walkthrough |
| `spawn_agent(type=1\|2\|3)` | Spawn Type 1, 2, or 3 agents |
| `add_subtask` | Add a subtask to the persisted task list |
| `read_subtasks` | Read the current subtask list and statuses |
| `merge_branches` | Merge one or more branches into the current working branch |
| `run_tests` | Execute the project test suite and report results |
| `fix_conflict` | Initiate conflict resolution (spawns sub-agents internally) |
| `emit_cr` | Emit a Change Request to the main plan |

### Key Distinctions from Normal Type 3

| Capability | Type 3 | Refinery |
|------------|--------|----------|
| Spawn Type 3 agents | No | **Yes** |
| Emit Change Requests | No | **Yes** |
| Merge branches | No (manual via bash) | **Dedicated tool** |
| Run tests | No (manual via bash) | **Dedicated tool** |
| Fix conflicts | No | **Dedicated tool** |
| Dedicated UI view | No | **Yes** |

### Change Requests (CRs)

When a Refinery discovers that upstream work is incorrect, incomplete, or incompatible, it emits a CR:

```json
{
  "type": "change_request",
  "refineryId": "agent-refinery-001",
  "targetTaskId": "task-042",
  "reason": "The authentication middleware from task-042 conflicts with the session handling from task-043. The middleware needs to check for existing sessions before creating new ones.",
  "suggestedAction": "RETRY | AMEND | MANUAL_REVIEW",
  "priority": "HIGH | MEDIUM | LOW"
}
```

CRs are sent to the executor, which may re-plan, re-assign, or escalate to the user depending on configuration.

### Configuration

Refineries support two operational modes:

- **Gated mode** (`refinery.requireApproval = true`): The Refinery pauses after validation and waits for explicit user permission before marking itself complete. The UI presents a summary and approve/reject controls.
- **Full steam mode** (`refinery.requireApproval = false`): The Refinery proceeds automatically if all tests pass and no blocking issues are found.

### Dedicated UI View

Each Refinery has its own view in the Forge UI showing:

- Branches being merged
- Test results (pass/fail with details)
- Conflicts detected and resolution status
- CRs emitted
- Subtasks spawned and their progress
- Approval controls (in gated mode)

### Special Prompts and Instructions

Refineries receive a distinct system prompt that emphasizes:

- Thoroughness in testing and validation
- Conservative merge strategy (prefer failing loudly over silent breakage)
- Structured reporting of issues found
- When and how to emit CRs vs. fixing locally

### Branch Strategy

- Primary branch: `forge/<taskId>/<attemptId>`
- Merge target branch is typically the integration point for multiple upstream branches.

### Sandbox

- Own E2B sandbox instance, destroyed after completion.
- 1-hour maximum lifetime (with pause/resume support).

---

## 6. Agent Hierarchy Rules

The spawning hierarchy is strictly enforced:

```
Refinery (3R)
├── can spawn → Type 3
│                ├── can spawn → Type 2
│                │                └── can spawn → Type 1
│                └── can spawn → Type 1
├── can spawn → Type 2
│                └── can spawn → Type 1
└── can spawn → Type 1

Type 3
├── can spawn → Type 2
│                └── can spawn → Type 1
└── can spawn → Type 1

Type 2
└── can spawn → Type 1

Type 1
└── (cannot spawn anything)
```

### Enforcement

- The `spawn_agent` tool validates the requested agent type against the caller's type at invocation time.
- If a Type 3 attempts to spawn another Type 3, the tool returns an error.
- If a Type 2 attempts to spawn a Type 2 or higher, the tool returns an error.
- Only the Refinery variant has `spawn_agent(type=3)` registered in its toolset.

### Rationale

- **Prevents infinite recursion**: Type 3 cannot spawn Type 3, so decomposition depth is bounded.
- **Maintains simplicity at the leaves**: Type 1 agents are pure workers with no orchestration overhead.
- **Centralizes integration authority**: Only Refineries can emit CRs and spawn Type 3s, keeping the feedback loop controlled.
- **Refineries are the exception**: Their elevated privileges are justified because they are explicitly placed at integration points by the planner.

---

## 7. Common Agent Behaviors

All agent types share the following behaviors regardless of type:

### Heartbeat

Every agent emits a `task.heartbeat` event approximately every **30 seconds** while alive. This allows the executor to detect stalled or crashed agents.

```json
{
  "type": "task.heartbeat",
  "agentId": "agent-abc-123",
  "taskId": "task-042",
  "timestamp": "2026-02-09T12:00:30Z"
}
```

If the executor does not receive a heartbeat for 2 consecutive intervals (60s), it considers the agent potentially stalled and may intervene.

### Progress Events

All agents emit `task.progress` events for streaming output to the UI:

```json
{
  "type": "task.progress",
  "agentId": "agent-abc-123",
  "taskId": "task-042",
  "content": "Implementing the validation logic for user registration...",
  "timestamp": "2026-02-09T12:01:15Z"
}
```

### Tool Events

Every tool invocation produces a pair of events:

```json
{
  "type": "tool.call",
  "agentId": "agent-abc-123",
  "tool": "bash",
  "params": { "command": "npm test" },
  "callId": "call-001",
  "timestamp": "2026-02-09T12:02:00Z"
}
```

```json
{
  "type": "tool.result",
  "agentId": "agent-abc-123",
  "tool": "bash",
  "callId": "call-001",
  "result": { "exitCode": 0, "stdout": "..." },
  "timestamp": "2026-02-09T12:02:05Z"
}
```

### Sandbox Lifecycle

- Every agent gets its own E2B sandbox instance.
- **1-hour maximum lifetime** with pause/resume support.
- The sandbox is destroyed after the agent completes (success or failure).
- The sandbox contains a clone of the repository at the appropriate branch.

### Git Branch Convention

All agents operate on branches following the naming pattern:

```
forge/<taskId>/<attemptId>
```

- `taskId` — the unique identifier for the task in the DAG
- `attemptId` — incremented on each retry

Before an agent is considered `MERGE_READY`, it **must push its branch to the remote**. The executor verifies that the remote branch exists and matches the agent's final commit.

### AGENTS.md and Agent Skills

All agents support the `AGENTS.md` standard:

- If an `AGENTS.md` file exists in the repository root, the agent reads it during initialization and incorporates its guidance into the system prompt.
- Agent Skills (project-specific tool configurations or instructions) are loaded from `AGENTS.md` skill definitions if present.

---

## 8. Walkthrough Emission

Every agent **must** emit a `walkthrough.md` artifact upon completion via the `emit_walkthrough` tool. This is a hard requirement — an agent that terminates without emitting a walkthrough is considered to have failed.

The walkthrough is a structured Markdown document that captures:

- What the agent was asked to do
- What it actually did (step by step)
- What files were created, modified, or deleted
- Any issues encountered and how they were resolved
- Final status and notes for downstream agents/reviewers

The walkthrough is stored in the centralized artifact store:

```
artifacts/<runId>/<taskId>/walkthrough.md
```

See [08-artifact-schemas.md](./08-artifact-schemas.md) for the full walkthrough schema and format.

---

## 9. pi-agent-core Integration

All agents are built on top of `pi-agent-core` (forked from `badlogic/pi-mono`). The integration follows a consistent pattern across all agent types.

### Agent Instantiation

Each agent is an instance of the `Agent` class from pi-agent-core:

```typescript
import { Agent, AgentTool } from "pi-agent-core";

const agent = new Agent({
  model: process.env.FORGE_MODEL,       // global model env var
  systemPrompt: getSystemPrompt(agentType, taskContext),
  tools: getToolsForType(agentType),
  maxIterations: getMaxIterations(agentType),
});
```

### System Prompt Configuration

Each agent type receives a tailored system prompt:

| Agent Type | System Prompt Emphasis |
|------------|----------------------|
| Type 1 | Focused execution, single task, no delegation |
| Type 2 | Autonomous work with optional delegation to Type 1 |
| Type 3 | Task decomposition, orchestration, subtask management |
| Refinery | Integration, testing, validation, quality control, CR emission |

### Tool Registration

Tools are registered as `AgentTool` instances with TypeBox schemas for parameter validation:

```typescript
import { Type } from "@sinclair/typebox";
import { AgentTool } from "pi-agent-core";

const readTool = new AgentTool({
  name: "read",
  description: "Read file contents from the sandbox filesystem",
  parameters: Type.Object({
    path: Type.String({ description: "Absolute path to the file" }),
  }),
  execute: async (params) => { /* ... */ },
});
```

Each agent type has a specific set of tools registered based on its capabilities (see Sections 2–5 for per-type toolsets).

### Event Forwarding

All events emitted by the agent (heartbeats, progress, tool calls, tool results) are forwarded to the executor via **NDJSON** over the sandbox's stdout:

```
{"type":"task.heartbeat","agentId":"agent-abc","taskId":"task-042","timestamp":"..."}
{"type":"tool.call","agentId":"agent-abc","tool":"bash","params":{...},"callId":"call-001","timestamp":"..."}
{"type":"tool.result","agentId":"agent-abc","tool":"bash","callId":"call-001","result":{...},"timestamp":"..."}
{"type":"task.progress","agentId":"agent-abc","taskId":"task-042","content":"...","timestamp":"..."}
```

The executor reads these events line-by-line and routes them to the appropriate handlers (UI updates, state transitions, heartbeat monitoring, etc.).

### Steering Queue

The steering queue allows the executor to send **high-priority control signals** to a running agent:

- **Pause**: Suspend agent execution (the sandbox is paused, not destroyed).
- **Resume**: Continue a paused agent.
- **Abort**: Immediately terminate the agent.
- **Inject context**: Push additional context or instructions into the agent's next iteration.

The agent checks the steering queue at the start of each inner-loop iteration.

### Follow-up Queue

The follow-up queue is used for **continuation after sub-agent completion**:

1. A Type 2/3/Refinery agent spawns a sub-agent and yields, waiting on the follow-up queue.
2. When the sub-agent completes, the executor pushes a completion event to the parent's follow-up queue.
3. The parent agent resumes, reads the sub-agent's results, and continues its work.

```json
{
  "type": "sub_agent.completed",
  "subAgentId": "agent-sub-001",
  "subTaskId": "subtask-003",
  "status": "SUCCESS",
  "branch": "forge/task-042/1/subtask-003",
  "walkthroughPath": "artifacts/run-001/subtask-003/walkthrough.md"
}
```

---

## Appendix: Agent Type Quick Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT TYPES                              │
├──────────┬──────────┬──────────────┬────────────────────────────┤
│ Type 1   │ Type 2   │ Type 3       │ Refinery (3R)              │
│ Throwaway│ Worker   │ Sub-executor │ Integration Gate           │
├──────────┼──────────┼──────────────┼────────────────────────────┤
│ Single   │ Multi-   │ Orchestrates │ Merges, tests, validates   │
│ task     │ step     │ subtasks     │ emits CRs                  │
├──────────┼──────────┼──────────────┼────────────────────────────┤
│ No spawn │ Spawn T1 │ Spawn T1, T2 │ Spawn T1, T2, T3          │
├──────────┼──────────┼──────────────┼────────────────────────────┤
│ No task  │ No task  │ Persisted    │ Persisted task list         │
│ list     │ list     │ task list    │ + merge/test tools         │
├──────────┼──────────┼──────────────┼────────────────────────────┤
│ 7 tools  │ 8 tools  │ 10 tools     │ 14 tools                   │
└──────────┴──────────┴──────────────┴────────────────────────────┘
```
