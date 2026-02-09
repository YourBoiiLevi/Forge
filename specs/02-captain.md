# 02 — Captain (Planner Agent)

> Cross-references: [05-toolset.md](./05-toolset.md) (tool interfaces), [07-task-dag.md](./07-task-dag.md) (DAG schema), [08-artifact-schemas.md](./08-artifact-schemas.md) (artifact formats)

---

## 1  Overview

The **Captain** is Forge's planning agent. It owns the entire planning phase: conducting a deep, interactive interview with the user, exploring the attached codebase, researching external resources, and ultimately producing a set of **immutable artifacts** — specs, tasks, and a DAG — that completely define the project before any execution begins.

The Captain has **full access to the toolset and codebase**. It can read, write, execute commands, search the web, and simulate file-system changes through the just-bash sandbox. It is the only agent that talks directly to the user during planning; all other agents operate autonomously during execution.

---

## 2  Interview Flow

### 2.1  Entry Point

The user initiates a planning session by sending a message to:

```
POST /captain/message
```

The request body contains the user's message and the `runId` that scopes the session. The Captain responds conversationally, and the exchange continues in a back-and-forth loop until the Captain has gathered enough information to produce its artifacts.

### 2.2  Repo Attachment

Before or at the start of the interview, the user attaches a GitHub repository. The repo falls into one of two categories:

| Category | Description |
|---|---|
| **Greenfield** | Empty or near-empty repo. The Captain plans the project from scratch. |
| **Brownfield** | Populated repo (existing codebase). The Captain plans a refactor, feature addition, migration, or other modification on top of existing code. |

The Captain must detect which category applies and adjust its questioning accordingly (e.g., brownfield requires codebase exploration before planning; greenfield requires more requirements elicitation).

### 2.3  Interview Phases

The interview is **not rigidly phased** — the Captain adapts organically — but it broadly proceeds through these stages:

1. **Orientation** — Understand what the user wants to build or change. Ask open-ended questions. If brownfield, explore the repo (`read`, `bash`) to understand the current state.
2. **Requirements Deepening** — Drill into functional requirements, non-functional constraints, target tech stack, testing strategy, deployment targets, third-party integrations, and acceptance criteria.
3. **Architecture Exploration** — Propose high-level architecture. Use `web_search` / `web_fetch` to research unfamiliar libraries or patterns. Validate choices with the user.
4. **Task Decomposition** — Break the project into tasks at appropriate granularity for the agent type hierarchy. Discuss ordering, dependencies, and integration risk with the user.
5. **Simulation & Validation** — Optionally use `plan_*` tools (just-bash sandbox) to prototype directory structures, config files, or build scripts to validate assumptions before committing to the plan.
6. **Artifact Generation** — Produce specs, tasks, and DAG using `create_spec`, `create_task`, and `set_dag`.

The Captain should **not** rush to artifact generation. It is better to ask one more question than to produce a flawed plan.

### 2.4  Interview Principles

- **Be thorough.** Ask clarifying questions even when the answer seems obvious.
- **Explore first.** For brownfield repos, read key files (README, package.json / Cargo.toml / go.mod, directory structure, existing tests) before asking questions.
- **Challenge assumptions.** If the user's request has ambiguity or potential contradictions, surface them explicitly.
- **Summarize periodically.** Reflect the user's requirements back to confirm understanding before moving to the next phase.
- **Respect the user's expertise.** Don't over-explain; match the user's technical depth.

---

## 3  Toolset

The Captain has access to the following tools during the planning phase. See [05-toolset.md](./05-toolset.md) for full interface definitions.

### 3.1  Codebase Tools (Live Repo)

These operate on the real attached repository inside the E2B sandbox.

| Tool | Description |
|---|---|
| `read` | Read file contents from the attached repo. |
| `write` | Write a file (full content replacement) to the repo. |
| `bash` | Execute a bash command in the E2B sandbox. |
| `edit` | Apply a diff-based edit to a file in the repo. |

### 3.2  Simulation Tools (just-bash)

These operate on an **in-memory / overlay filesystem** powered by [just-bash](https://github.com/nicholasgasior/just-bash), a TypeScript-based bash interpreter. Changes made here do **not** affect the real repo. The Captain uses these to prototype and validate plans safely.

| Tool | Description |
|---|---|
| `plan_read` | Read file contents from the just-bash simulation filesystem. |
| `plan_write` | Write a file to the just-bash simulation filesystem. |
| `plan_bash` | Execute a bash command inside just-bash (TypeScript bash interpreter, in-memory/overlay FS). |
| `plan_edit` | Apply a diff-based edit to a file in the just-bash simulation filesystem. |

### 3.3  Research Tools

| Tool | Description |
|---|---|
| `web_search` | Search the web via the Exa AI search endpoint. Returns ranked results with titles, URLs, and snippets. |
| `web_fetch` | Fetch full page content via the Exa AI contents endpoint. Returns the page body as clean markdown. |

### 3.4  Artifact Tools

| Tool | Description |
|---|---|
| `create_spec` | Create a spec document (markdown) in the artifact store at `artifacts/<runId>/specs/`. |
| `create_task` | Create a task document (markdown with YAML frontmatter) in the artifact store at `artifacts/<runId>/tasks/<taskId>.md`. |
| `set_dag` | Write `dag.json` to the artifact store at `artifacts/<runId>/dag.json`. |

---

## 4  Output Artifacts

The Captain produces exactly **three kinds** of artifact. Together they form a complete, self-contained project plan.

### 4.1  Specs

**Location:** `artifacts/<runId>/specs/`

Specs are detailed, exhaustive **reference documents** written in markdown. They capture everything a downstream agent needs to understand the project context without access to the original conversation:

- Functional and non-functional requirements
- Architecture decisions and rationale
- Technology choices and constraints
- API contracts and data models
- Security, performance, and accessibility requirements
- External service integrations
- Glossary of domain terms

There is no fixed schema for specs — they are free-form markdown — but they must be **complete enough** that an agent reading only the specs and a single task can produce correct output.

Specs are created via the `create_spec` tool.

### 4.2  Tasks

**Location:** `artifacts/<runId>/tasks/<taskId>.md`

Each task is a markdown file with **YAML frontmatter** followed by a detailed markdown body.

#### Frontmatter Schema

```yaml
---
id: string              # Unique task identifier (e.g., "task-001")
title: string            # Human-readable task title
type: 1 | 2 | 3 | refinery  # Agent type assigned to execute this task
dependencies:            # List of task IDs that must complete before this task
  - string
acceptance_criteria:     # Concrete, testable criteria for task completion
  - string
estimated_complexity: small | medium | large  # Rough sizing hint
description: string      # One-line summary of the task
---
```

#### Frontmatter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique identifier. Convention: `task-NNN` (zero-padded). |
| `title` | `string` | Yes | Short, descriptive title. |
| `type` | `1 \| 2 \| 3 \| refinery` | Yes | Determines which agent class executes this task. Type 1 = simple/mechanical, Type 2 = moderate complexity, Type 3 = complex/architectural, Refinery = integration/validation checkpoint. |
| `dependencies` | `string[]` | Yes | Task IDs that must complete before this task can begin. Empty array `[]` for root tasks. |
| `acceptance_criteria` | `string[]` | Yes | List of concrete, testable conditions. Every criterion must be verifiable by the executing agent (e.g., "all tests pass", "endpoint returns 200 with valid payload"). |
| `estimated_complexity` | `small \| medium \| large` | Yes | Sizing hint for scheduling. Does not affect agent selection. |
| `description` | `string` | Yes | One-line summary. |

#### Markdown Body

The body contains **detailed implementation instructions**: what to build, which files to touch, relevant spec sections to reference, edge cases to handle, testing strategy, and any other context the executing agent needs.

Tasks are created via the `create_task` tool.

### 4.3  DAG (Directed Acyclic Graph)

**Location:** `artifacts/<runId>/dag.json`

The DAG defines the **execution order** of all tasks. It encodes blocking dependencies and strategically places refinery tasks at integration points.

See [07-task-dag.md](./07-task-dag.md) for the full DAG JSON schema.

Key properties:

- **Nodes** correspond 1:1 to tasks.
- **Edges** encode blocking dependencies (a task cannot start until all its dependencies are complete).
- **Refinery nodes** are placed at strategic integration points where multiple parallel branches converge, ensuring consistency and correctness before downstream work begins.
- The DAG must be **acyclic** — circular dependencies are invalid.
- The DAG is designed to **maximize parallelism** while **minimizing merge conflicts** (per Cursor's research, structuring tasks to touch disjoint file sets significantly reduces conflicts).

The DAG is written via the `set_dag` tool.

---

## 5  Plan Immutability

Once the Captain finishes producing artifacts, the plan is **immutable**.

### 5.1  Pre-Execution Editing Window

After the Captain completes planning but **before execution begins**, there is an editing window where:

- The user can manually edit any artifact (specs, tasks, DAG) in the artifact store.
- Edits are direct file modifications — no special tooling required.
- This is the **only** time artifacts can be freely modified.

### 5.2  During Execution

Once execution starts, the plan **cannot be directly modified**. The only mechanism for plan changes during execution is a **Change Request (CR)**.

- CRs are **append-only overlays** — they add new tasks, modify DAG edges, or annotate existing tasks, but they never rewrite or delete existing artifacts.
- See section 7 (Captain Re-invocation) for how CRs are processed.

---

## 6  Model Configuration

The model powering the Captain is set via a **global environment variable**. There is no per-agent model override — every agent in Forge (Captain, workers, refineries) uses the **same model**.

```
FORGE_MODEL=<model-identifier>
```

The Captain does not have a special model allocation. If the global model changes, the Captain uses the new model on its next invocation.

---

## 7  Captain Re-invocation (Change Requests)

During execution, when an agent encounters a problem it cannot resolve — a missing dependency, a spec ambiguity, an architectural conflict — it emits a **Change Request (CR)**.

### 7.1  Default Behavior

By default, the CR triggers a **re-invocation of the Captain** for a **mini-replan**:

1. The Captain receives the CR payload, which describes the issue, the originating task, and any relevant context.
2. The Captain performs a scoped analysis — reading the current plan, the failing task, and potentially the codebase — to understand the problem.
3. The Captain produces **overlay artifacts**:
   - New tasks (appended to the task store, with new IDs).
   - DAG modifications (new edges, new nodes — never removing existing edges/nodes).
   - Optional spec amendments (new spec files, never overwriting existing ones).
4. Execution resumes with the updated plan.

### 7.2  Constraints

- The Captain **never rewrites history** during a CR. Existing artifacts remain untouched.
- Overlay tasks and DAG modifications are **additive only**.
- The CR and its resolution are recorded for auditability.
- The mini-replan interview is **not** interactive with the user — the Captain operates autonomously using the CR context.

---

## 8  System Prompt Guidelines

The Captain's system prompt must instruct it to follow these behaviors:

### 8.1  Interview Conduct

- Ask thorough, clarifying questions before committing to any plan.
- Never assume requirements — always confirm with the user.
- Summarize understanding periodically and ask for corrections.
- Adapt question depth to the complexity of the project.

### 8.2  Codebase Exploration

- For brownfield repos: **always** explore the codebase before planning. Read the README, dependency manifests, directory structure, key source files, and existing tests.
- For greenfield repos: confirm the target stack, tooling preferences, and project structure with the user.
- Use `bash` to run discovery commands (`find`, `wc -l`, `grep`, tree listings) as needed.

### 8.3  Task Granularity

- Design tasks at the appropriate granularity for the agent type hierarchy:
  - **Type 1** (simple): Boilerplate, config files, scaffolding, straightforward CRUD, mechanical refactors.
  - **Type 2** (moderate): Feature implementation, API endpoints with business logic, component development with moderate complexity.
  - **Type 3** (complex): Architectural work, complex algorithms, cross-cutting concerns, security-critical code.
  - **Refinery**: Integration checkpoints — run tests across merged branches, validate API contracts, ensure consistency between frontend and backend.
- Prefer **smaller, focused tasks** over large monolithic ones. A task should be completable in a single agent session.

### 8.4  DAG Design

- **Maximize parallelism.** Independent tasks should not have artificial dependencies.
- **Minimize merge conflicts.** Structure tasks so parallel branches touch disjoint file sets wherever possible. Cursor's research confirms this strategy is effective at reducing conflicts in multi-agent systems.
- **Place refineries strategically.** Insert refinery tasks at points where parallel branches converge, especially:
  - After all tasks touching a shared module complete.
  - Before downstream tasks that depend on integrated output.
  - At natural integration boundaries (e.g., after frontend + backend API work converges).
- **Keep the critical path short.** Avoid unnecessary sequential chains.

### 8.5  Brownfield vs. Greenfield

- **Brownfield:** Focus on understanding what exists. Identify code that must not break. Plan tasks that integrate with (not replace) existing patterns. Add migration/compatibility tasks where needed.
- **Greenfield:** Focus on architectural decisions. Ensure early tasks establish conventions (project structure, linting, CI, base configs) that later tasks build upon.

### 8.6  Standards Support

- If the repo contains an `AGENTS.md` file, the Captain must read it and incorporate its guidance into the plan (test commands, conventions, constraints).
- If the repo follows the **Agent Skills** standard, the Captain should respect skill boundaries when decomposing tasks.

---

## 9  API Surface

### 9.1  User-Facing Endpoint

```
POST /captain/message
```

**Request:**

```json
{
  "runId": "string",
  "message": "string"
}
```

**Response:** Streamed or synchronous Captain reply (implementation-defined).

The endpoint is used for all user ↔ Captain communication during the planning interview. The Captain maintains conversation history scoped to the `runId`.

### 9.2  Internal Invocation (CR Replan)

When a Change Request triggers a mini-replan, the orchestrator invokes the Captain internally with the CR payload. This is **not** an interactive session — the Captain operates in single-shot mode, producing overlay artifacts and returning.

---

## 10  Lifecycle Summary

```
┌─────────────────────────────────────────────────────────┐
│                    PLANNING PHASE                        │
│                                                         │
│  User ←──── POST /captain/message ────→ Captain         │
│       │                                    │            │
│       │   (back-and-forth interview)       │            │
│       │                                    │            │
│       │   Captain explores codebase        │            │
│       │   Captain researches (web)         │            │
│       │   Captain simulates (plan_*)       │            │
│       │                                    │            │
│       └────────────────────────────────────┘            │
│                        │                                │
│                        ▼                                │
│              ┌─────────────────┐                        │
│              │  Produce        │                        │
│              │  Artifacts      │                        │
│              │  ┌───────────┐  │                        │
│              │  │  Specs    │  │                        │
│              │  │  Tasks    │  │                        │
│              │  │  DAG      │  │                        │
│              │  └───────────┘  │                        │
│              └─────────────────┘                        │
│                        │                                │
│              ┌─────────────────┐                        │
│              │  User Edit      │  ◄── optional          │
│              │  Window         │                        │
│              └─────────────────┘                        │
│                        │                                │
└────────────────────────┼────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────┐
              │  EXECUTION      │  (plan is now immutable)
              │  PHASE          │
              └────────┬────────┘
                       │
                  CR emitted?
                       │
                       ▼
              ┌─────────────────┐
              │  Captain        │  (mini-replan, non-interactive)
              │  Re-invocation  │
              │  → overlay      │
              │    artifacts    │
              └─────────────────┘
```
