# 01 — Architecture Overview

> Forge is a fire-and-forget autonomous software engineering system. You describe a massive project, a Captain agent interviews you thoroughly to create an immutable plan, then an Executor runs agents in parallel across isolated E2B sandboxes until the project is complete.

---

## 1. System Overview

Forge implements the **Ralph Wiggum loop** — Plan, Build, Learn, Repeat — at industrial scale. A single human interaction (the Captain interview) produces an immutable execution plan. From that point forward, the system is fully autonomous: an Executor loop traverses a task DAG, spawns worker agents across isolated cloud sandboxes, reviews their output, and adapts to emergent issues — all without further human input (unless a Change Request requires review).

### Three Phases

| Phase | Owner | Description |
|-------|-------|-------------|
| **Plan** | Captain (Planner Agent) | Interactive interview with the user. Explores codebase, researches online, produces specs, tasks, and a dependency DAG. |
| **Build** | Executor + Worker Agents | Executor traverses DAG, spawns agents in E2B sandboxes. Agents work on branches, push code, emit walkthroughs. |
| **Learn** | Executor + Refineries | Executor reviews walkthroughs for risks/followups. Refineries merge branches, run integration tests, emit Change Requests if needed. |

---

## 2. Component Architecture

### 2.1 Captain (Planner Agent)

The Captain conducts a back-and-forth interactive interview with the user. It has full access to the codebase (read, write, bash, edit) plus simulation tools (plan_read, plan_write, plan_bash, plan_edit via just-bash) and web research (web_search, web_fetch via Exa AI).

**Outputs three immutable artifacts:**
- **Specs** — Project reference markdown files.
- **Tasks** — Markdown files with YAML frontmatter (id, type, dependencies, acceptance criteria).
- **DAG** — `dag.json` defining execution flow with blocking dependencies and strategically placed refineries.

See [02-captain.md](./02-captain.md) for the full specification.

### 2.2 Executor Loop

The central orchestration loop. Single-writer locked, idempotent operations.

- Reads the DAG to determine which tasks are ready (all blocking dependencies in MERGED status).
- Spawns agents of the appropriate type for each ready task.
- Monitors heartbeats (~30s interval); marks tasks STALE on timeout.
- Reviews walkthrough.md documents from completed agents to identify emergent issues.
- Can dynamically spawn cleanup agents for issues outside the pre-made plan.
- Cannot modify the plan/specs/DAG/tasks (plan is immutable).
- Handles Change Request halts and Captain re-invocation.

See [03-executor-loop.md](./03-executor-loop.md) for the full specification.

### 2.3 Agent Types

Four agent types forming a capability hierarchy:

| Type | Name | Can Spawn | Key Capability |
|------|------|-----------|----------------|
| 1 | Throwaway | Nothing | Single fine-grained task |
| 2 | Default Worker | Type 1 | Delegation to sub-agents |
| 3 | Sub-executor | Type 1, 2 | Own persisted task list |
| Refinery | Special Type 3 | Type 1, 2, 3 | Branch merging, CR emission, integration testing |

All agents run in their own E2B sandbox, on their own git branch (`forge/<taskId>/<attemptId>`), using the same globally configured model.

See [04-agent-types.md](./04-agent-types.md) for the full specification.

### 2.4 Artifact Store

A centralized just-bash directory mounted as a local filesystem on the backend server, **outside** E2B sandboxes. Agent tools translate operations to just-bash commands for the central store.

```
artifacts/
├── <runId>/
│   ├── specs/                  # Project reference docs
│   ├── tasks/                  # Task definitions (YAML frontmatter + MD)
│   ├── dag.json                # Execution DAG
│   ├── dag-status.json         # Runtime status tracking
│   ├── run-state.json          # Overall run state
│   ├── change-requests/        # CRs with overlays
│   └── <taskId>/
│       ├── <attemptId>/
│       │   └── walkthrough.md  # Per-attempt walkthrough
│       └── subtasks/           # Type 3 persisted task lists
```

All writes are atomic: write to `.tmp`, fsync, then rename. This prevents partial reads by the Executor or any other consumer.

See [08-artifact-schemas.md](./08-artifact-schemas.md) for all artifact formats.

### 2.5 E2B Sandbox Pool

- One E2B sandbox per worker agent.
- ~150ms boot time from custom template snapshot.
- 1-hour continuous runtime on Base tier (24h on Pro), with pause/resume to reset the limit.
- Custom template pre-installed with Node.js, git, pnpm, Chromium, Firefox, VSCode, dev3000, agent-browser, and standard Unix utilities.
- Sandboxes are killed after agent completion (or preserved on failure for debugging, configurable).

See [06-sandbox-git.md](./06-sandbox-git.md) and [12-e2b-template.md](./12-e2b-template.md) for details.

### 2.6 Web Interface

Brutalist industrial design. Active orange (`#FF6B00`) on carbon black (`#0a0a0a`). Sharp edges, no gradients.

- **Typography**: Geist-Pixel for primary/accents, Geist Mono for everything else.
- **Views**: Dashboard (DAG + active agents), Captain Interview (chat), Task Detail (streaming output), Refinery (merge progress), Artifacts Browser, Change Request review.
- **Real-time**: NDJSON event stream from the backend, character-by-character agent output streaming.
- **Emergency**: "Pause All" button — prominently displayed, always accessible.
- **Future**: tmux-like multi-pane view (deferred, not MVP).

See [10-web-interface.md](./10-web-interface.md) for the full specification.

### 2.7 SDK / API Layer

Express.js REST API with NDJSON streaming. TypeScript-only SDK.

- **REST endpoints**: CRUD for runs, tasks, artifacts, change requests, Captain messaging.
- **Event stream**: `GET /runs/:runId/stream` returns NDJSON with monotonic sequence numbers and event IDs for reliable replay.
- **SDK**: `ForgeSDK` class providing `createRun()`, `streamEvents()`, `sendCaptainMessage()`, `listTasks()`, `getArtifact()`, `approveChangeRequest()`, etc.

See [09-sdk-api.md](./09-sdk-api.md) for the full specification.

---

## 3. Data Flow

### 3.1 Planning Phase

```
User ──message──▶ Captain ──explores──▶ Codebase (via E2B sandbox)
  ▲                  │                     Web (via Exa AI)
  │                  │                     Simulation (via just-bash)
  │    captain.message events              
  └──────────────────┘
                     │
                     ▼
              Artifact Store
         ┌──────────────────────┐
         │  specs/              │
         │  tasks/<taskId>.md   │
         │  dag.json            │
         └──────────────────────┘
```

1. User creates a run via `POST /runs` with a GitHub repo URL.
2. Captain starts an interactive interview, asking clarifying questions.
3. User responds via `POST /captain/message`.
4. Captain explores the codebase (read, bash, edit in E2B) and researches online (web_search, web_fetch).
5. Captain uses plan_* tools (just-bash simulation) to prototype ideas.
6. Captain produces specs, tasks, and dag.json via create_spec, create_task, set_dag tools.
7. Plan is presented for user review. User can edit artifacts before execution.
8. User signals readiness; plan becomes immutable; execution begins.

### 3.2 Execution Phase

```
Executor ──reads──▶ DAG
    │
    ├──spawn──▶ Agent (E2B Sandbox) ──works──▶ Git Branch
    │               │                              │
    │               ├──heartbeat (~30s)────────────▶│
    │               ├──tool.call / tool.result─────▶│
    │               └──emit_walkthrough────────────▶ Artifact Store
    │
    ├──reads walkthrough──▶ Identifies risks/followups
    │
    ├──spawn cleanup agents (if needed)
    │
    └──mark_task_status──▶ DAG status update
```

1. Executor reads dag.json, finds tasks with all dependencies in MERGED status.
2. Spawns agents (idempotently) with appropriate type for each ready task.
3. Agent boots in E2B sandbox, clones repo, merges dependency branches, works.
4. Agent emits heartbeats, progress events, tool calls (forwarded as NDJSON).
5. Agent completes: emits walkthrough, pushes branch to remote.
6. Executor marks task DONE → MERGE_READY (on pushed ref confirmation).
7. Executor reviews walkthrough for risks/followups, may spawn cleanup agents.

### 3.3 Integration Phase (Refinery)

```
Refinery (E2B Sandbox)
    │
    ├──merge_branches──▶ Merge accumulated feature branches
    ├──run_tests──────▶ Integration test suite
    ├──fix_conflict────▶ Spawn sub-agents for conflict resolution
    │
    ├── Success ──▶ mark tasks MERGED
    │
    └── Issue found ──▶ emit_cr ──▶ Halts execution loop
                                        │
                                        ▼
                                   Captain re-invoked
                                   (mini-replan with CR context)
                                        │
                                        ▼
                                   Overlay artifacts produced
                                   Executor resumes with updated plan
```

### 3.4 Change Request Flow

1. Refinery discovers a plan-level flaw during integration.
2. Refinery calls `emit_cr` with title, description, reason.
3. Execution loop halts: no new tasks start, running tasks complete.
4. By default, Captain is re-invoked for a mini-replan with CR context.
5. Captain produces overlay artifacts (new tasks, DAG modifications) without rewriting history.
6. CRs are append-only overlays stored as markdown + dag-overlay.json.
7. Configurable: require user review instead of automatic Captain re-invocation.
8. After CR is processed/approved, executor resumes with merged DAG (base + overlays).

---

## 4. Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Language** | TypeScript + Node.js | Everything — backend, SDK, agent tooling |
| **Backend Framework** | Express.js | REST API, NDJSON streaming |
| **LLM API** | forge-ai (fork of pi-ai from badlogic/pi-mono) | Unified API across 20+ providers: OpenAI, Anthropic, Google (GenAI + Vertex), Bedrock, Mistral, xAI, Groq, Cerebras, OpenRouter, custom OpenAI-compatible |
| **Agent Loop** | forge-agent (fork of pi-agent-core from badlogic/pi-mono) | Inner/outer loop, steering/follow-up queues, event-driven architecture, AgentTool with TypeBox schemas |
| **Sandbox** | E2B | Cloud VMs for agent execution (~150ms boot, custom templates, pause/resume) |
| **Simulation FS** | just-bash (Vercel Labs) | TypeScript bash interpreter with in-memory/overlay filesystem for plan_* tools and artifact store |
| **Web Search** | Exa AI | Search endpoint (`POST /search`) and contents endpoint (`POST /contents`) for web_search and web_fetch tools |
| **Persistence** | JSON files on local filesystem | Local-only, single-user prototype. Artifact store via just-bash mounted directory |
| **Streaming** | NDJSON over HTTP | Event stream for real-time updates to frontend and SDK consumers |
| **Tool Schemas** | TypeBox + AJV | Runtime validation of tool parameters |

### Key Dependencies

| Package | Source | Notes |
|---------|--------|-------|
| `@mariozechner/pi-ai` | Fork from badlogic/pi-mono `packages/ai/` | Keep everything. Provides model registry, streaming, cost tracking, tool validation. |
| `@mariozechner/pi-agent-core` | Fork from badlogic/pi-mono `packages/agent/` | Keep everything. Minimal dependency (only pi-ai). Provides Agent class, events, steering. |
| `just-bash` | npm: `just-bash` | In-memory bash + filesystem. Used for plan_* tools and artifact store. |
| `@e2b/code-interpreter` | npm | E2B SDK for sandbox creation, command execution, file operations, pause/resume. |
| `exa-js` | npm | Exa AI TypeScript SDK for web search and content retrieval. |
| `express` | npm | HTTP server framework. |
| `@sinclair/typebox` | npm (via pi-ai) | JSON schema definitions for tool parameters. |

See [11-agent-core.md](./11-agent-core.md) for the pi-mono fork strategy.

---

## 5. Design Principles

### 5.1 Immutable Plans

The plan (specs, tasks, DAG) is frozen after the planning phase. Users can edit before execution begins. Once execution starts, the only mechanism for plan modification is **Change Requests** — append-only overlays that preserve the original plan history.

### 5.2 Isolation

Every worker agent runs in its own E2B cloud sandbox with its own git branch. Agents cannot interfere with each other's work. The artifact store is the only shared state, accessed through atomic writes.

### 5.3 Idempotent Executor

All executor operations are idempotent. Re-running "schedule task X" does not spawn a second agent. Task status transitions are guarded by version checks. This is critical for crash recovery and retry logic.

### 5.4 Single-Writer Lock

Only one executor loop instance runs at a time. This prevents race conditions in task scheduling, status transitions, and agent spawning. The lock is acquired at executor startup and released on shutdown/pause.

### 5.5 Atomic Artifact Writes

All artifact writes follow the protocol: write to `<path>.tmp` → fsync → rename to `<path>`. This guarantees that any reader (executor, API, frontend) always sees either the old complete file or the new complete file, never a partial write.

### 5.6 Deterministic Branch Naming

Branches follow the pattern `forge/<taskId>/<attemptId>`. This makes branches predictable, debuggable, and attempt-scoped. A failed task retried with a new attempt gets a fresh branch, preserving the failed attempt's branch for debugging.

### 5.7 Per-Worker Merge Logic

Workers that depend on other tasks merge those dependency branches into their own working branch **themselves**, before starting work. This is NOT centralized in the executor. Workers can spawn a Type 1 sub-agent to handle the merge. This design preserves parallelism — the alternative ("single integration branch") was explicitly rejected because it kills parallelism.

### 5.8 DAG-Driven Conflict Minimization

The Captain designs the DAG to minimize merge conflicts by separating concerns across parallel tasks (different files/modules). Cursor's research confirms this strategy generally works at scale.

### 5.9 Exponential Backoff

Applied to:
- API calls to LLM providers (transient failures, rate limits)
- E2B operations (sandbox creation, commands)
- Git remote operations (push, pull, clone)

**NOT** applied to deterministic failures (e.g., syntax errors, missing files).

### 5.10 Agent Skills & AGENTS.md

Forge respects the Agent Skills standard and AGENTS.md files in the target repository. Agents read and follow these files when present.

---

## 6. Deployment Model

Forge is a **local-only, single-user prototype**.

- **Backend**: Express.js server running on localhost (e.g., `localhost:3001`).
- **Frontend**: Web interface served by the backend or a separate dev server (e.g., `localhost:3000`).
- **Artifact Store**: Local filesystem directory managed by just-bash, mounted at a configurable path.
- **E2B Sandboxes**: Cloud-hosted by E2B. Require an E2B API key.
- **LLM Provider**: Configured via environment variable. Requires appropriate API key(s).
- **Exa AI**: Cloud API for web search/fetch. Requires an Exa API key.
- **GitHub**: User's repo. Requires a GitHub token for push/pull operations.

### Required Environment Variables

```
FORGE_MODEL=claude-sonnet-4-20250514    # Global model for all agents
E2B_API_KEY=e2b_...                      # E2B sandbox API key
EXA_API_KEY=exa_...                      # Exa AI search API key
GITHUB_TOKEN=ghp_...                     # GitHub personal access token
ANTHROPIC_API_KEY=sk-ant-...             # LLM provider API key (example)
# Additional provider keys as needed (OPENAI_API_KEY, GOOGLE_API_KEY, etc.)
```

---

## 7. Security Considerations

- **API keys**: Stored as environment variables on the backend server. Never written to artifacts, logs, or agent output.
- **Sandbox isolation**: E2B sandboxes are fully isolated VMs. Agents cannot access the host filesystem or other sandboxes.
- **GitHub token**: Injected into sandboxes at runtime via environment variables. Scoped to the minimum required permissions (repo read/write).
- **Artifact store**: Local filesystem only. No network exposure in MVP.
- **No authentication**: MVP is local-only, single-user. No auth layer on the REST API.
- **No MCP**: MCP support was considered and explicitly deferred.
- **Secrets in output**: Agents are prompted to never log or emit secrets. The system does not enforce this at a technical level in MVP.

---

## 8. Cross-Reference Index

| Spec | File | Topic |
|------|------|-------|
| 01 | `01-architecture-overview.md` | This document |
| 02 | [02-captain.md](./02-captain.md) | Captain (Planner Agent) |
| 03 | [03-executor-loop.md](./03-executor-loop.md) | Executor Loop |
| 04 | [04-agent-types.md](./04-agent-types.md) | Agent Types & Hierarchy |
| 05 | [05-toolset.md](./05-toolset.md) | Toolset Specification |
| 06 | [06-sandbox-git.md](./06-sandbox-git.md) | Sandbox & Git Strategy |
| 07 | [07-task-dag.md](./07-task-dag.md) | Task DAG Schema |
| 08 | [08-artifact-schemas.md](./08-artifact-schemas.md) | Artifact Schemas |
| 09 | [09-sdk-api.md](./09-sdk-api.md) | SDK / API Design |
| 10 | [10-web-interface.md](./10-web-interface.md) | Web Interface |
| 11 | [11-agent-core.md](./11-agent-core.md) | Agent Core (pi-mono fork) |
| 12 | [12-e2b-template.md](./12-e2b-template.md) | E2B Template Definition |
