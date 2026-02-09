# 07 — Task DAG Schema

## 1. Overview

The Task DAG (Directed Acyclic Graph) defines the execution order of tasks with blocking dependencies and strategically placed refineries. It is the single authoritative structure that the Executor traverses to determine what to run and when.

- **Storage**: `artifacts/<runId>/dag.json`
- **Created by**: The Captain during the planning phase (see [02-captain.md](./02-captain.md))
- **Immutability**: The DAG is immutable after planning completes. The Executor never modifies the base DAG. Only Change Requests (CRs) can introduce overlay modifications that add new nodes and edges at runtime.

---

## 2. dag.json Schema

```typescript
interface DAG {
  version: 1;
  runId: string;
  nodes: DAGNode[];
  metadata: {
    createdAt: string;   // ISO 8601 (e.g. "2026-02-09T14:30:00Z")
    createdBy: 'captain';
    totalTasks: number;
    totalRefineries: number;
  };
}

interface DAGNode {
  id: string;                        // matches taskId (e.g. "task-001")
  type: 'task' | 'refinery';
  agentType: 1 | 2 | 3 | 'refinery';
  dependencies: string[];            // list of node IDs — ALL are blocking
  status: TaskStatus;
  metadata?: Record<string, unknown>;
}

type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'MERGE_READY'
  | 'MERGED'
  | 'FAILED'
  | 'STALE';
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `version` | `1` | Schema version. Always `1` for this revision. |
| `runId` | `string` | Unique identifier for the current Forge run. |
| `nodes` | `DAGNode[]` | Ordered list of every task and refinery in the plan. |
| `metadata.createdAt` | `string` | ISO 8601 timestamp of DAG creation. |
| `metadata.createdBy` | `'captain'` | Always `'captain'` — no other actor creates the base DAG. |
| `metadata.totalTasks` | `number` | Count of nodes where `type === 'task'`. |
| `metadata.totalRefineries` | `number` | Count of nodes where `type === 'refinery'`. |

### DAGNode Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique node identifier. For tasks this matches the `taskId` used everywhere else in the system. |
| `type` | `'task' \| 'refinery'` | Discriminator between work-producing tasks and integration refineries. |
| `agentType` | `1 \| 2 \| 3 \| 'refinery'` | Which agent class executes this node. Types 1–3 are task agents; `'refinery'` is the merge/integration agent. |
| `dependencies` | `string[]` | IDs of nodes that must reach `MERGED` status before this node can start. Empty array means no blockers. |
| `status` | `TaskStatus` | Current lifecycle state of the node (see §4). |
| `metadata` | `Record<string, unknown>` | Optional bag for Captain-supplied hints (e.g. estimated complexity, target files). |

### Example

```json
{
  "version": 1,
  "runId": "run-20260209-a3f8",
  "nodes": [
    {
      "id": "task-000",
      "type": "task",
      "agentType": 1,
      "dependencies": [],
      "status": "PENDING"
    },
    {
      "id": "task-001",
      "type": "task",
      "agentType": 2,
      "dependencies": ["task-000"],
      "status": "PENDING"
    },
    {
      "id": "task-002",
      "type": "task",
      "agentType": 2,
      "dependencies": ["task-000"],
      "status": "PENDING"
    },
    {
      "id": "refinery-001",
      "type": "refinery",
      "agentType": "refinery",
      "dependencies": ["task-001", "task-002"],
      "status": "PENDING"
    },
    {
      "id": "task-003",
      "type": "task",
      "agentType": 3,
      "dependencies": ["refinery-001"],
      "status": "PENDING"
    }
  ],
  "metadata": {
    "createdAt": "2026-02-09T14:30:00Z",
    "createdBy": "captain",
    "totalTasks": 4,
    "totalRefineries": 1
  }
}
```

In this example `task-001` and `task-002` run in parallel after `task-000` is merged. `refinery-001` waits for both, then `task-003` follows the refinery.

---

## 3. Task Markdown Format

Each task is stored as a standalone Markdown file with YAML front matter at:

```
artifacts/<runId>/tasks/<taskId>.md
```

### Template

```yaml
---
id: task-001
title: "Implement user authentication API"
type: 2                    # agent type: 1, 2, 3, or refinery
dependencies:
  - task-000               # setup task
acceptance_criteria:
  - "POST /api/auth/register creates a new user"
  - "POST /api/auth/login returns a JWT token"
  - "Invalid credentials return 401"
  - "Passwords are never stored in plaintext"
estimated_complexity: medium   # small | medium | large
status: PENDING
branch: null               # set when agent starts: forge/<taskId>/<attemptId>
attemptId: null            # set when agent starts
---

## Description
Implement the user authentication system with JWT-based tokens...

## Context
This task depends on the database setup (task-000) which provides...

## Instructions
1. Create the auth routes...
2. Implement password hashing with bcrypt...
...
```

### Front Matter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Must match the node ID in `dag.json`. |
| `title` | `string` | Yes | Human-readable summary. |
| `type` | `1 \| 2 \| 3 \| 'refinery'` | Yes | Agent type that will execute this task. |
| `dependencies` | `string[]` | Yes | List of blocking node IDs (mirrors `dag.json`). |
| `acceptance_criteria` | `string[]` | Yes | Concrete, testable criteria the agent must satisfy. |
| `estimated_complexity` | `'small' \| 'medium' \| 'large'` | Yes | Hint for the Executor's scheduling and parallelism decisions. |
| `status` | `TaskStatus` | Yes | Current status (must stay in sync with `dag.json`). |
| `branch` | `string \| null` | Yes | Git branch name, set to `forge/<taskId>/<attemptId>` when the agent starts. `null` until then. |
| `attemptId` | `string \| null` | Yes | Unique attempt identifier, incremented on retries. `null` until the agent starts. |

### Body Sections

| Section | Purpose |
|---|---|
| `## Description` | Full description of the work to be done. |
| `## Context` | Relevant background: why the task exists, what it depends on, architectural notes. |
| `## Instructions` | Step-by-step guidance for the agent. Can reference files, modules, and patterns. |

The Captain generates these files during planning. The Executor reads them to configure and spawn agents.

---

## 4. Task Status State Machine

### States

| Status | Meaning |
|---|---|
| `PENDING` | Task created, waiting for all dependencies to reach `MERGED`. |
| `RUNNING` | An agent has been spawned and is actively working. |
| `DONE` | The agent completed its work and emitted a walkthrough. Code is committed locally. |
| `MERGE_READY` | The task branch has been pushed to the remote. Gated on the pushed ref existing on the remote, not just on the agent reporting "done". |
| `MERGED` | The Refinery has merged the task branch into the integration branch. |
| `FAILED` | The agent encountered an unrecoverable error. The task can be retried with a new `attemptId`. |
| `STALE` | The agent's heartbeat timed out. Treated as a failure that can be retried. |

### Valid Transitions

```
PENDING ──────► RUNNING        Executor spawns agent
RUNNING ──────► DONE           Agent completes work
RUNNING ──────► FAILED         Agent encounters unrecoverable error
RUNNING ──────► STALE          Heartbeat timeout exceeded
DONE ─────────► MERGE_READY    Branch pushed to remote (verified by ref check)
MERGE_READY ──► MERGED         Refinery merges the branch
FAILED ───────► PENDING        Retry: new attemptId assigned
STALE ────────► PENDING        Retry: new attemptId assigned
```

### State Machine Diagram

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
               ┌─────────┐                                │
        ┌──────│ PENDING  │◄──────────────────────┐        │
        │      └─────────┘                        │        │
        │           │                             │        │
        │    spawn agent                     retry │   retry │
        │           │                             │        │
        │           ▼                             │        │
        │      ┌─────────┐    heartbeat      ┌────────┐   │
        │      │ RUNNING  │──── timeout ────►│ STALE  │───┘
        │      └─────────┘                   └────────┘
        │       │       │
        │  completes   fails
        │       │       │
        │       ▼       ▼
        │   ┌──────┐  ┌────────┐
        │   │ DONE │  │ FAILED │───── retry ──► PENDING
        │   └──────┘  └────────┘
        │       │
        │  push to remote
        │       │
        │       ▼
        │  ┌─────────────┐
        │  │ MERGE_READY  │
        │  └─────────────┘
        │       │
        │  refinery merges
        │       │
        │       ▼
        │  ┌──────────┐
        └─►│  MERGED   │  (terminal state — dependents unblocked)
           └──────────┘
```

### Invariants

- A node can only be in one status at a time.
- `MERGED` is a terminal state; no transitions out.
- `FAILED` and `STALE` always transition back to `PENDING` on retry, never directly to `RUNNING`.
- Every status transition emits an event (see §7).

---

## 5. Dependency Rules

1. **All dependencies are blocking.** There are no optional or soft dependencies. This is a deliberate simplification: if a task lists a dependency, it cannot start until that dependency reaches `MERGED`.

2. **Start condition.** A task can transition from `PENDING` to `RUNNING` only when **every** node ID in its `dependencies` array has `status === 'MERGED'`.

3. **Root tasks.** Tasks with an empty `dependencies` array (`[]`) have no blockers and are eligible to start immediately when the Executor begins traversal.

4. **Refinery placement.** Refinery nodes typically depend on a set of related tasks that form a logical group (e.g., all tasks for a single feature). The Refinery merges their branches into the integration branch before downstream tasks can proceed.

5. **Cycle detection.** Circular dependencies are invalid. The Captain must enforce acyclicity at DAG creation time. The Executor should also validate the DAG on load and reject it if a cycle is detected (fail-fast).

6. **Validation rules at creation:**
   - Every ID referenced in a `dependencies` array must correspond to an existing node in `nodes`.
   - No node may list itself in its own `dependencies`.
   - A topological sort of the graph must succeed (proves acyclicity).
   - Every refinery node must have at least one dependency.

---

## 6. DAG Design Guidelines

These guidelines are for the Captain when constructing the DAG during planning.

### Granularity

Tasks can be fine-grained or coarse. The three agent types naturally support delegation:
- **Type 1** (simple): single-file or single-function changes.
- **Type 2** (standard): multi-file feature implementation.
- **Type 3** (complex): sub-executor that manages its own internal task list.

The Captain should choose the appropriate agent type based on the complexity of the work, not force everything into one granularity level.

### Refinery Placement

Place refineries at natural integration points:
- After all tasks for a feature are complete.
- Before a downstream task that depends on the combined output of multiple parallel tasks.
- At the boundary between independent subsystems that must integrate.

Do **not** place a refinery after every single task — that serializes execution unnecessarily.

### Minimizing Merge Conflicts

- Assign parallel tasks to separate files or modules whenever possible.
- Identify shared files (e.g., configuration, route registrations, barrel exports) and either:
  - Serialize tasks that touch them, or
  - Assign those edits to a single task that others depend on.
- Consider brownfield implications: identify areas of the existing codebase where concurrent edits are likely to conflict.

### Immutability

- The Executor **cannot** add, remove, or modify tasks in the base DAG mid-execution.
- The plan is sealed after the Captain produces it.
- If emergent issues arise during execution, the Executor can:
  - Spawn ad-hoc agents outside the plan (not tracked in the DAG).
  - Process Change Requests that add overlay nodes and edges (see §8).
- Type 3 sub-executors maintain their own dynamic internal task lists, but these are scoped to the sub-executor and do not modify the top-level DAG.

---

## 7. Status Tracking

### Source of Truth

The `status` field in `dag.json` is the **sole source of truth** for task status. The `status` field in individual task Markdown files should mirror `dag.json` but is considered secondary.

### Atomic Updates

Status updates use atomic file operations to prevent corruption:

1. Write the updated `dag.json` to `dag.json.tmp`.
2. `fsync` the temporary file.
3. Rename `dag.json.tmp` → `dag.json` (atomic on most filesystems).

This ensures readers always see a complete, valid DAG — never a partially written file.

### Optimistic Concurrency

Each `dag.json` write includes a monotonically increasing version number (stored alongside or derived from the file's modification state). Before writing, the Executor checks that the current version matches what it last read. If another process updated the DAG in the interim, the write is rejected and the Executor re-reads before retrying.

### Event Emission

Every status transition emits a structured event:

```typescript
interface StatusEvent {
  nodeId: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  timestamp: string;    // ISO 8601
  attemptId?: string;   // present on RUNNING, FAILED, STALE transitions
  reason?: string;      // present on FAILED, STALE transitions
}
```

Events are consumed by:
- The Executor (to schedule newly unblocked tasks).
- The logging/telemetry layer.
- Any future UI or dashboard.

---

## 8. Change Request Overlays

Change Requests (CRs) allow the plan to evolve without rewriting history. The base `dag.json` is never modified after creation.

### Storage

```
artifacts/<runId>/change-requests/<crId>/dag-overlay.json
```

### Overlay Schema

```typescript
interface DAGOverlay {
  crId: string;
  appliedAt: string;        // ISO 8601 timestamp
  addedNodes: DAGNode[];    // new nodes to insert
  addedEdges: {
    from: string;           // existing or newly added node ID
    to: string;             // existing or newly added node ID
  }[];
}
```

### Merge Semantics

At runtime the Executor constructs the **effective DAG** by:

1. Loading the base `dag.json`.
2. Scanning `artifacts/<runId>/change-requests/*/dag-overlay.json` in `appliedAt` order.
3. For each overlay:
   - Appending `addedNodes` to the node list.
   - For each edge in `addedEdges`, adding `edge.from` to the `dependencies` array of the target node (`edge.to`).
4. Validating the merged graph (cycle detection, dangling references).

### Constraints

- Overlays are **append-only** — they can only **add** nodes and edges, never remove or modify existing structure.
- An overlay cannot change the status of an existing node.
- The merged graph must remain a valid DAG (acyclic, no dangling references).
- Each CR overlay is applied at most once (idempotent merge keyed on `crId`).

---

## Cross-References

- [02-captain.md](./02-captain.md) — DAG creation during the planning phase.
- [03-executor-loop.md](./03-executor-loop.md) — DAG traversal and task scheduling at runtime.
- [08-artifact-schemas.md](./08-artifact-schemas.md) — Detailed artifact file formats including dag.json and task Markdown.
