# 08 — Artifact Schemas

> Canonical reference for every artifact Forge persists. All artifacts live in a centralized just-bash directory mounted as a local filesystem on the backend server (outside E2B sandboxes). Agent tools translate operations to just-bash commands for this central store.

---

## 1  Artifact Store Layout

```
artifacts/
├── <runId>/
│   ├── specs/
│   │   ├── architecture.md
│   │   ├── auth-system.md
│   │   └── ...
│   ├── tasks/
│   │   ├── task-001.md
│   │   ├── task-002.md
│   │   └── ...
│   ├── dag.json
│   ├── dag-status.json              # runtime status tracking
│   ├── change-requests/
│   │   ├── cr-001/
│   │   │   ├── change-request.md
│   │   │   └── dag-overlay.json
│   │   └── ...
│   ├── <taskId>/
│   │   ├── <attemptId>/
│   │   │   └── walkthrough.md
│   │   └── subtasks/                # Type 3 agents only
│   │       ├── subtask-001.md
│   │       └── ...
│   └── run-state.json               # overall run state
```

### 1.1  Namespacing Convention

| Scope   | Path                                              |
| ------- | ------------------------------------------------- |
| Run     | `artifacts/<runId>/`                               |
| Task    | `artifacts/<runId>/<taskId>/`                       |
| Attempt | `artifacts/<runId>/<taskId>/<attemptId>/`           |

Multiple attempts of the same task coexist without overwriting previous attempts.

---

## 2  Atomic Write Protocol

Every artifact write follows a three-step sequence:

1. Write content to `<path>.tmp`.
2. `fsync` the temporary file.
3. Rename `<path>.tmp` → `<path>` (atomic on POSIX filesystems).

This prevents the executor or any reader from observing partial or corrupted files. The just-bash filesystem operations enforce this at the tool level; individual agents do **not** implement it themselves.

---

## 3  Walkthrough Format

**Location:** `artifacts/<runId>/<taskId>/<attemptId>/walkthrough.md`

One walkthrough is produced per task attempt. It is the primary output artifact of a worker agent.

### 3.1  Schema

```yaml
---
task_id: task-001
branch: forge/task-001/attempt-1
base_ref: main
status: completed          # completed | failed | partial
confidence: 0.95           # float 0.0–1.0
time_spent_minutes: 12     # wall-clock minutes
files_changed:
  - path: src/auth/login.ts
    reason: "Implemented login endpoint"
  - path: src/auth/register.ts
    reason: "Implemented registration endpoint"
tests:
  - name: "auth.login.success"
    result: pass             # pass | fail | skip | error
  - name: "auth.login.invalid"
    result: pass
  - name: "auth.register.duplicate"
    result: fail
risks:
  - "Password hashing may be slow under high load"
  - "JWT expiry not configurable yet"
followups:
  - "Add rate limiting to auth endpoints"
  - "Implement refresh token flow"
---

## Summary
Implemented the user authentication system with JWT-based tokens...

## Approach
Used bcrypt for password hashing, jsonwebtoken for JWT generation...

## Issues Encountered
- Had to work around a TypeScript strict mode issue with...
- Database migration required manual index creation...

## Testing
All 15 acceptance criteria tests pass except for duplicate registration...
```

### 3.2  Field Reference

| Field                | Type       | Required | Description                                           |
| -------------------- | ---------- | -------- | ----------------------------------------------------- |
| `task_id`            | `string`   | yes      | ID of the task this walkthrough covers.               |
| `branch`             | `string`   | yes      | Git branch containing the work.                       |
| `base_ref`           | `string`   | yes      | Branch/ref the work branched from.                    |
| `status`             | `enum`     | yes      | `completed` · `failed` · `partial`                    |
| `confidence`         | `float`    | yes      | Agent self-assessed confidence (0.0–1.0).             |
| `time_spent_minutes` | `integer`  | yes      | Wall-clock time in minutes.                           |
| `files_changed`      | `array`    | yes      | List of `{ path, reason }` objects.                   |
| `files_changed[].path`   | `string` | yes  | Repository-relative file path.                        |
| `files_changed[].reason` | `string` | yes  | One-line explanation of the change.                   |
| `tests`              | `array`    | no       | List of `{ name, result }` objects.                   |
| `tests[].name`       | `string`   | yes      | Human-readable test identifier.                       |
| `tests[].result`     | `enum`     | yes      | `pass` · `fail` · `skip` · `error`                   |
| `risks`              | `array`    | no       | Free-text risk descriptions.                          |
| `followups`          | `array`    | no       | Suggested follow-up work items.                       |

### 3.3  Body Sections

The Markdown body after the frontmatter MUST include the following sections in order:

1. **Summary** — one-paragraph overview of what was accomplished.
2. **Approach** — technical approach and key decisions.
3. **Issues Encountered** — problems hit during implementation and how they were resolved.
4. **Testing** — summary of test results and any gaps.

Additional sections MAY be appended.

---

## 4  Change Request Format

**Location:** `artifacts/<runId>/change-requests/cr-<NNN>/change-request.md`

Change requests (CRs) are emitted by refinery agents (or other agents) when the existing plan needs to be modified.

### 4.1  Schema

```yaml
---
id: cr-001
title: "Auth system needs refresh tokens"
emitted_by: refinery-001
emitted_at: "2024-01-15T10:30:00Z"      # ISO 8601
status: pending                          # pending | approved | rejected | applied
reason: "Integration testing revealed that short-lived JWTs without refresh tokens cause poor UX"
affected_tasks:
  - task-001
  - task-005
suggested_changes: |
  Add a new task for implementing refresh token flow.
  Modify task-005 to include refresh token validation in middleware.
---

## Description
During integration testing of the authentication flow, it became clear that...

## Impact Assessment
- Requires new task for refresh token implementation
- Existing auth tasks (task-001, task-005) need minor modifications
- No breaking changes to other completed tasks

## Proposed Resolution
1. Create new task: "Implement refresh token endpoint"
2. Add dependency from new task to task-001
3. ...
```

### 4.2  Field Reference

| Field               | Type       | Required | Description                                              |
| ------------------- | ---------- | -------- | -------------------------------------------------------- |
| `id`                | `string`   | yes      | Unique CR identifier (`cr-NNN`).                         |
| `title`             | `string`   | yes      | Short human-readable title.                              |
| `emitted_by`        | `string`   | yes      | ID of the agent that created the CR.                     |
| `emitted_at`        | `string`   | yes      | ISO 8601 timestamp of creation.                          |
| `status`            | `enum`     | yes      | `pending` · `approved` · `rejected` · `applied`         |
| `reason`            | `string`   | yes      | Why this change is needed.                               |
| `affected_tasks`    | `string[]` | yes      | Task IDs impacted by the change.                         |
| `suggested_changes` | `string`   | yes      | Free-text description of the proposed modifications.     |

### 4.3  Body Sections

1. **Description** — detailed explanation of the issue.
2. **Impact Assessment** — scope of blast radius.
3. **Proposed Resolution** — concrete steps to resolve.

### 4.4  Status Lifecycle

```
pending ──▶ approved ──▶ applied
        └──▶ rejected
```

Only the Captain may transition a CR out of `pending`. Applying a CR also produces a `dag-overlay.json` in the same directory.

---

## 5  DAG Overlay Format

**Location:** `artifacts/<runId>/change-requests/cr-<NNN>/dag-overlay.json`

A DAG overlay describes mutations to apply on top of the base `dag.json` when a change request is approved.

### 5.1  Schema

```typescript
interface DAGOverlay {
  crId: string;                          // e.g. "cr-001"
  appliedAt: string;                     // ISO 8601 timestamp
  addedNodes: DAGNode[];                 // new nodes to insert (see 07-task-dag.md)
  addedEdges: {
    from: string;                        // existing or newly added node ID
    to: string;                          // existing or newly added node ID
  }[];
}
```

**Note:** Overlays are **append-only** — they can only add nodes and edges, never remove or modify existing structure. This preserves plan immutability and prevents accidental disruption of in-flight work.

### 5.2  Field Reference

| Field               | Type       | Required | Description                                         |
| ------------------- | ---------- | -------- | --------------------------------------------------- |
| `crId`              | `string`   | yes      | The change request this overlay belongs to.         |
| `appliedAt`         | `string`   | yes      | ISO 8601 timestamp when the overlay was applied.    |
| `addedNodes`        | `DAGNode[]`| yes      | New DAG nodes to insert (may be empty `[]`).          |
| `addedEdges`        | `array`    | yes      | New dependency edges to add (may be empty `[]`).      |
| `addedEdges[].from` | `string`   | yes      | Source node ID (existing or newly added).             |
| `addedEdges[].to`   | `string`   | yes      | Target node ID (existing or newly added).           |

### 5.3  Application Semantics

The executor applies overlays in `appliedAt` order. The resulting effective DAG is:

```
effective_dag = base_dag
for overlay in overlays sorted by appliedAt:
    effective_dag.nodes += overlay.addedNodes
    for edge in overlay.addedEdges:
        effective_dag.nodes[edge.to].dependencies.push(edge.from)
```

Overlays are strictly additive. Conflicts (e.g., adding an edge to a non-existent node) are detected at apply time and surface as executor errors.

---

## 6  Run State Format

**Location:** `artifacts/<runId>/run-state.json`

Single source of truth for the overall status of a run.

### 6.1  Schema

```typescript
interface RunState {
  runId: string;
  repoUrl: string;
  status: 'planning' | 'plan_review' | 'executing' | 'paused' | 'completed' | 'failed';
  createdAt: string;                   // ISO 8601
  startedAt?: string;                  // ISO 8601, set when execution begins
  completedAt?: string;                // ISO 8601, set on terminal status
  currentPhase: 'captain_interview' | 'plan_review' | 'execution' | 'paused' | 'completed';
  model: string;                       // global model identifier
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  activeCRs: string[];                 // CR IDs currently being processed
  lastEventId: string;                 // ID of the most recent event
  lastEventSeq: number;               // monotonically increasing sequence number
}
```

### 6.2  Field Reference

| Field            | Type       | Required | Description                                          |
| ---------------- | ---------- | -------- | ---------------------------------------------------- |
| `runId`          | `string`   | yes      | Unique run identifier.                               |
| `repoUrl`        | `string`   | yes      | Repository URL being operated on.                    |
| `status`         | `enum`     | yes      | High-level run status.                               |
| `createdAt`      | `string`   | yes      | ISO 8601 creation timestamp.                         |
| `startedAt`      | `string`   | no       | ISO 8601 timestamp when execution began.             |
| `completedAt`    | `string`   | no       | ISO 8601 timestamp when run reached terminal state.  |
| `currentPhase`   | `enum`     | yes      | Current lifecycle phase.                             |
| `model`          | `string`   | yes      | Model identifier (e.g. `claude-sonnet-4-20250514`).     |
| `totalTasks`     | `integer`  | yes      | Total tasks in the DAG.                              |
| `completedTasks` | `integer`  | yes      | Tasks that have completed successfully.              |
| `failedTasks`    | `integer`  | yes      | Tasks that have exhausted all attempts.              |
| `runningTasks`   | `integer`  | yes      | Tasks currently being executed by worker agents.     |
| `activeCRs`      | `string[]` | yes      | Change request IDs currently in flight.              |
| `lastEventId`    | `string`   | yes      | Most recent event ID for idempotency.                |
| `lastEventSeq`   | `integer`  | yes      | Monotonically increasing sequence number.            |

### 6.3  Status Lifecycle

```
planning ──▶ plan_review ──▶ executing ──▶ completed
                                │   ▲         │
                                ▼   │         │
                              paused          │
                                              ▼
                                           failed
```

---

## 7  Spec Document Format

**Location:** `artifacts/<runId>/specs/<filename>.md`

Plain Markdown files. No required frontmatter or special structure beyond being clear, detailed reference documents produced during the Captain's planning phase.

Specs are **immutable** once the run enters the `executing` phase. If a spec needs to be revised, a change request must be filed.

---

## 8  Task Document Format

**Location:** `artifacts/<runId>/tasks/task-<NNN>.md`

Markdown with YAML frontmatter. See **07-task-dag.md** for the full task schema, including all frontmatter fields, acceptance criteria, and dependency declarations.

---

## 9  Type 3 Subtask Format

**Location:** `artifacts/<runId>/<taskId>/subtasks/subtask-<NNN>.md`

Type 3 (orchestrator) agents decompose their assigned task into subtasks. Each subtask is a standalone document.

### 9.1  Schema

```yaml
---
id: subtask-001
parent_task: task-010
title: "Extract utility functions"
type: 1                        # agent type for the subtask (1 | 2 | 3)
status: pending                # pending | running | completed | failed
assigned_agent: null           # agent ID once assigned, null until then
---

## Description
Extract common utility functions from...
```

### 9.2  Field Reference

| Field            | Type              | Required | Description                                     |
| ---------------- | ----------------- | -------- | ----------------------------------------------- |
| `id`             | `string`          | yes      | Unique subtask identifier within the parent.    |
| `parent_task`    | `string`          | yes      | Task ID of the parent Type 3 task.              |
| `title`          | `string`          | yes      | Short human-readable title.                     |
| `type`           | `integer`         | yes      | Agent type to assign (`1`, `2`, or `3`).        |
| `status`         | `enum`            | yes      | `pending` · `running` · `completed` · `failed` |
| `assigned_agent` | `string \| null`  | yes      | Agent ID once dispatched; `null` before.        |

### 9.3  Body

The Markdown body MUST include a **Description** section with enough context for the assigned agent to execute the subtask independently.

---

## 10  DAG Status Format

**Location:** `artifacts/<runId>/dag-status.json`

Runtime companion to `dag.json`. While `dag.json` describes the static graph structure, `dag-status.json` tracks live execution state for every node.

### 10.1  Schema

```typescript
interface DAGStatus {
  runId: string;
  updatedAt: string;                   // ISO 8601, last mutation timestamp
  nodes: Record<string, NodeStatus>;   // keyed by node/task ID
}

interface NodeStatus {
  taskId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'MERGE_READY' | 'MERGED' | 'FAILED' | 'STALE';
  currentAttempt: number;              // 1-indexed
  maxAttempts: number;
  assignedAgent?: string;              // agent ID if running
  startedAt?: string;                  // ISO 8601
  completedAt?: string;               // ISO 8601
  lastError?: string;                  // error message from most recent failed attempt
}
```

---

## Cross-References

| Topic                  | Spec                    |
| ---------------------- | ----------------------- |
| DAG schema & semantics | `07-task-dag.md`        |
| Artifact creation      | `02-captain.md`         |
| Artifact consumption   | `03-executor-loop.md`   |
