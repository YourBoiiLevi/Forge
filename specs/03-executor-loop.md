# 03 — Executor Loop

> Status: **Draft**
> Cross-references: [04-agent-types.md](04-agent-types.md) · [07-task-dag.md](07-task-dag.md) · [08-artifact-schemas.md](08-artifact-schemas.md) · [09-sdk-api.md](09-sdk-api.md)

---

## 1. Overview

The **Executor Loop** is Forge's central orchestration process. It performs exactly four jobs:

1. **Route** — read the DAG and determine which tasks are ready to run.
2. **Spawn** — create agents of the appropriate type for each ready task.
3. **Review** — inspect `walkthrough.md` artifacts produced by completed agents to surface emergent issues.
4. **Adapt** — spawn cleanup or follow-up agents for issues discovered during review.

### Immutability constraint

The Executor **cannot** modify the plan, specs, DAG, or task definitions. Those artifacts are owned by the Captain / Planner and are treated as immutable by the Executor. Any structural change to the plan must go through a Change Request (CR) flow (see §8).

---

## 2. Toolset

The Executor has access to the following tools. Each tool maps to a single SDK call.

| Tool | Signature | Description |
|------|-----------|-------------|
| `spawn_agent` | `spawn_agent(type, taskId, config) → agentId` | Spawn an agent of the given type (`1`, `2`, `3`, or `refinery`) bound to `taskId`. **Must be idempotent** — calling `spawn_agent` for a task that already has an active agent is a no-op and returns the existing `agentId`. |
| `read_spec` | `read_spec(specId) → SpecDocument` | Read a spec document from the artifact store. |
| `read_task` | `read_task(taskId) → TaskDocument` | Read a task document (markdown with YAML frontmatter) from the artifact store. |
| `read_dag` | `read_dag() → DAG` | Read the current `dag.json` from the artifact store. Returns the full node and edge set. |
| `read_walkthrough` | `read_walkthrough(taskId) → WalkthroughDocument` | Read the `walkthrough.md` produced by a completed agent for a given task. |
| `mark_task_status` | `mark_task_status(taskId, status) → void` | Transition a task to a new status in the state machine. Invalid transitions are rejected. |
| `prepare_branch` | `prepare_branch(taskId, attemptId) → { branch, baseRef }` | Create and configure the task branch. Creates `forge/<taskId>/<attemptId>` from base ref and merges all dependency branches into it. Returns the branch name and base ref for the agent to use. |

### Idempotency note

`spawn_agent` uses `taskId` as a deduplication key. The Executor maintains a `Map<taskId, agentId>` in its local state. If an agent already exists for a task and has not terminated, subsequent calls return early. This prevents double-spawning even if the Executor loop restarts or retries.

---

## 3. DAG Traversal Logic

Each tick of the Executor loop performs the following:

```
1. dag ← read_dag()
2. for each node in dag.nodes:
     if node.status == PENDING
        AND every dependency edge (dep → node) has dep.status == MERGED:
          readySet.add(node)
3. for each task in readySet:
     spawn_agent(task.type, task.id, task.config)
     mark_task_status(task.id, RUNNING)
```

### Rules

- **All dependencies are blocking.** There is no concept of a "soft" or "optional" dependency. A task cannot start until every upstream node is in the `MERGED` state.
- Ready tasks are spawned **in parallel** — the Executor does not serialize agent creation.
- **Refinery nodes** are special DAG nodes placed by the Planner. They represent integration checkpoints and follow the same traversal rules but spawn a Refinery agent (a special Type 3 variant). See §7 for details.
- The Executor re-reads `dag.json` on every tick. It does not cache the DAG across ticks.

---

## 4. Task State Machine

Every task has a `status` field that follows a strict state machine:

```
                 ┌──────────┐
                 │  PENDING  │
                 └────┬─────┘
                      │ spawn_agent
                      ▼
                 ┌──────────┐
                 │  RUNNING  │
                 └────┬──┬───┘
                      │  │
            heartbeat │  │ error
            timeout   │  │
                      ▼  ▼
                 ┌──────┐ ┌────────┐
                 │ DONE │ │ FAILED │
                 └──┬───┘ └────┬───┘
                    │          │
          branch    │          │ retry (new attemptId)
          pushed    │          │
                    ▼          ▼
              ┌─────────────┐  ┌──────────┐
              │ MERGE_READY │  │ PENDING  │
              └──────┬──────┘  └────▲─────┘
                     │             │
                     │ merged by   │
                     │ Refinery    │
                     ▼             │
                ┌─────────┐       │
                │ MERGED  │       │
                └────┬────┘       │
                     └─────────────┘
                         ▲
                         │
                         │ heartbeat timeout
                         │
                      ┌──┴───┐
                      │ STALE │
                      └──┬───┘
                         │ retry (new attemptId)
                         └───────────────
```

### Status definitions

| Status | Meaning |
|--------|---------|
| `PENDING` | Task exists in the DAG but has not been scheduled. |
| `RUNNING` | An agent has been spawned and is actively working on the task. |
| `DONE` | The agent has finished execution and produced artifacts (including `walkthrough.md`). The branch may or may not be pushed yet. |
| `MERGE_READY` | The task's branch has been **pushed to the remote**. This is the gate — `MERGE_READY` is only set when a pushed ref is confirmed, not merely when the agent reports "done". |
| `MERGED` | The branch has been merged (by a Refinery or directly). Downstream tasks can now unblock. |
| `FAILED` | The agent encountered an unrecoverable error. The task can be retried (see §10). |
| `STALE` | The Executor has not received a heartbeat from the agent for `N` seconds (see §9). The task can be retried. |

### Valid transitions

```
PENDING     → RUNNING
RUNNING     → DONE
RUNNING     → FAILED
RUNNING     → STALE
DONE        → MERGE_READY
MERGE_READY → MERGED
FAILED      → PENDING      (retry: new attemptId assigned)
STALE       → PENDING      (retry: new attemptId assigned)
```

All other transitions are invalid and must be rejected by `mark_task_status`.

---

## 5. Walkthrough Review

When a task enters the `DONE` state, the Executor reads its `walkthrough.md` artifact and inspects it for emergent issues.

### Walkthrough schema

The `walkthrough.md` file uses YAML frontmatter (see `08-artifact-schemas.md` for the canonical schema):

```yaml
---
task_id: "forge-task-0012"
branch: "forge/forge-task-0012/1"
base_ref: "main"
status: "completed"     # completed | failed | partial
confidence: 0.92        # 0.0–1.0, agent self-assessment
time_spent_minutes: 14
files_changed:
  - path: src/api/routes.ts
    reason: "Implemented API routes"
  - path: src/api/middleware.ts
    reason: "Added auth middleware"
tests:
  - name: "auth.login.success"
    result: pass        # pass | fail | skip | error
  - name: "auth.login.invalid"
    result: pass
  - name: "auth.register.duplicate"
    result: fail
risks:
  - "Middleware ordering may conflict with auth module"
followups:
  - "Add integration test for /api/v2/health"
  - "Refactor shared validation logic from routes.ts"
---

## Summary
...
```

### Review logic

1. **Parse `risks`** — each entry is logged as a warning-level event. If a risk references a file or module that is also touched by another in-flight task, the Executor logs a `conflict.potential` event.
2. **Parse `followups`** — each follow-up is a candidate for a dynamically spawned agent (see below).
3. **Confidence threshold** — if `confidence < 0.6`, the Executor logs a `review.low_confidence` event. This does not automatically fail the task but is surfaced to the user in the event stream.

### Dynamic agent spawning

Follow-ups and risks can trigger the Executor to spawn additional agents **outside the pre-made plan**. These agents:

- Are **not** part of the DAG. They do not appear as nodes, and no other task depends on them.
- Operate on their own branches (e.g., `forge/followup-<id>/1`).
- Are tracked in the Executor's local state, not in `dag.json`.
- Do not violate plan immutability — the plan/DAG is unchanged; these are side-channel work.

The Executor decides whether to spawn follow-up agents based on heuristics:

- If a follow-up contains keywords like `bug`, `fix`, `broken`, `regression` → auto-spawn a Type 1 agent.
- If a follow-up is more open-ended (e.g., `refactor`, `investigate`) → log it but do not auto-spawn unless configured to.
- All spawning decisions are emitted as events so the user can audit them.

---

## 6. Agent Spawning Rules

The `type` field in a task's frontmatter determines which kind of agent the Executor spawns.

| Type | Name | Description | Can spawn |
|------|------|-------------|-----------|
| `1` | Throwaway | Single fine-grained task. Runs to completion and terminates. No sub-agents. | — |
| `2` | Default Worker | Standard worker. Can delegate sub-work to Type 1 agents. | Type 1 |
| `3` | Sub-executor | Has its own persisted task list. Can orchestrate multiple pieces of work. | Type 1, Type 2 |
| `refinery` | Refinery | Special Type 3 variant. Placed by the Planner at integration points. Merges branches, runs integration checks, emits CRs. | Type 1, Type 2, Type 3 |

### Spawning flow

```
1. task ← read_task(taskId)
2. type ← task.frontmatter.type        # "1" | "2" | "3" | "refinery"
3. config ← {
     spec:      task.frontmatter.spec,
     branch:    "forge/<taskId>/<attemptId>",
     base_ref:  task.frontmatter.base_ref,
     artifacts: task.frontmatter.artifacts,
   }
4. agentId ← spawn_agent(type, taskId, config)
5. mark_task_status(taskId, RUNNING)
6. emit event: task.started { taskId, agentId, type }
```

### Hierarchy constraints

- A Type 1 agent **cannot** spawn any sub-agents.
- A Type 2 agent **can** spawn Type 1 sub-agents only.
- A Type 3 agent **can** spawn Type 1 and Type 2 sub-agents.
- A Refinery **can** spawn Type 1, Type 2, and Type 3 sub-agents. It can also merge branches and emit Change Requests.

See `04-agent-types.md` for full agent contracts.

---

## 7. Change Request (CR) Handling

A **Change Request** is emitted when a Refinery determines that the current plan is insufficient — for example, a merge conflict reveals a missing task, or integration tests expose a gap.

### CR lifecycle

```
1. Refinery emits CR       → cr.emitted event
2. Executor pauses         → run.paused event
   - No new tasks are scheduled
   - Currently RUNNING tasks are allowed to complete
3. CR is processed:
   a. Default: Captain is re-invoked for a mini-replan
   b. Configurable: CR is held for user review / approval
4. Plan overlay is applied  → updated DAG, new tasks
5. Executor resumes        → run.resumed event
```

### Append-only overlays

CRs produce **overlay** documents, not rewrites. The original plan history is preserved:

```
plan/
  plan.md              ← original plan (immutable)
  overlay-001.md       ← first CR overlay
  overlay-002.md       ← second CR overlay
dag.json               ← reflects all overlays applied in order
```

Each overlay contains:
- The CR that triggered it.
- New tasks added (with their frontmatter).
- New edges added to the DAG.
- A reference to the Refinery that emitted the CR.

The Executor reads `dag.json` which already has overlays applied. It does not need to merge overlays itself — that is the Captain's responsibility.

### Pause semantics

When paused:
- `mark_task_status` calls for `RUNNING → DONE` and `DONE → MERGE_READY` are still allowed (in-flight work completes).
- `spawn_agent` calls are rejected (returns error, no-op).
- The Executor continues processing heartbeats and can still mark tasks `STALE`.
- The Executor resumes only after the CR is resolved and the updated `dag.json` is available.

---

## 8. Idempotency & Single-Writer Lock

### Idempotency

Every Executor operation must be safe to retry:

| Operation | Idempotency mechanism |
|-----------|----------------------|
| `spawn_agent` | Deduplication by `taskId`. If agent exists and is alive, return existing `agentId`. |
| `mark_task_status` | State machine rejects invalid transitions. Re-applying the same transition is a no-op. |
| `read_*` | Pure reads — inherently idempotent. |

### Single-writer lock

Only **one Executor loop** may run at a time. This is enforced by an advisory lock:

- On startup, the Executor acquires a lock (e.g., a file lock on `.forge/executor.lock` or a distributed lock in the artifact store).
- If the lock is already held, the new Executor instance exits immediately.
- The lock is released on graceful shutdown.
- The lock has a TTL. If the Executor crashes without releasing the lock, the TTL expires and a new instance can acquire it.

This prevents:
- Double-spawning of agents for the same task.
- Race conditions in task state transitions.
- Conflicting walkthrough review decisions.

---

## 9. Heartbeat Monitoring

Agents emit a `task.heartbeat` event every ~30 seconds while actively working.

### Monitoring logic

```
for each task where status == RUNNING:
  lastHeartbeat ← heartbeatMap[task.id]
  if now() - lastHeartbeat > STALE_THRESHOLD:
    mark_task_status(task.id, STALE)
    emit event: task.stale { taskId, lastHeartbeat }
```

- `STALE_THRESHOLD` is configurable. Default: **60 seconds** (2 missed heartbeats).
- The Executor forwards received `task.heartbeat` events to the event stream.
- STALE tasks can be retried (see §10).

---

## 10. Error Recovery

### Retry logic

When a task is in `FAILED` or `STALE` state, the Executor can retry it:

```
1. attemptId ← task.attemptCount + 1
2. branch ← "forge/<taskId>/<attemptId>"
3. mark_task_status(taskId, PENDING)   // Reset to PENDING for new attempt
4. mark_task_status(taskId, RUNNING)   // Then transition to RUNNING
5. spawn_agent(task.type, taskId, { ...task.config, branch, attemptId })
6. emit event: task.retried { taskId, attemptId }
```

### Retry policy

- Maximum retries per task: configurable (default: **3**).
- After max retries, the task remains `FAILED` and the Executor emits `task.exhausted`.
- The Executor can also choose to **delay** a retry (e.g., if the failure was due to a transient infra issue).

### Exponential backoff

External operations use exponential backoff with jitter:

| Operation type | Base delay | Max delay | Max attempts |
|----------------|-----------|-----------|--------------|
| E2B sandbox operations | 1s | 30s | 5 |
| Git remote operations (push, fetch) | 2s | 60s | 5 |
| Artifact store reads/writes | 500ms | 15s | 4 |

Formula: `delay = min(base * 2^attempt + random_jitter(0, base), max_delay)`

### Round re-execution

The Executor can re-execute an entire "round" of the DAG if a systemic failure is detected (e.g., all tasks in a round fail due to a base-ref issue). This is a manual trigger, not automatic.

---

## 11. Event Emission

The Executor emits **NDJSON** events for every significant action. Each event is a single JSON object on one line, written to the event stream.

### Event catalog

| Event | Emitted when | Key fields |
|-------|-------------|------------|
| `run.started` | Executor loop begins a new run | `runId`, `dagHash`, `timestamp` |
| `run.paused` | Executor pauses due to a CR | `runId`, `crId`, `reason` |
| `run.resumed` | Executor resumes after CR resolution | `runId`, `crId`, `overlayId` |
| `run.completed` | All DAG nodes are in `MERGED` state | `runId`, `duration`, `taskCount` |
| `task.scheduled` | A task is identified as ready | `taskId`, `type`, `dependencies` |
| `task.started` | An agent is spawned for a task | `taskId`, `agentId`, `type`, `branch` |
| `task.completed` | An agent finishes and produces artifacts | `taskId`, `agentId`, `status`, `confidence` |
| `task.failed` | An agent fails | `taskId`, `agentId`, `error`, `attemptId` |
| `task.stale` | Heartbeat timeout detected | `taskId`, `lastHeartbeat`, `threshold` |
| `task.retried` | A failed/stale task is retried | `taskId`, `attemptId`, `branch` |
| `task.exhausted` | A task has exceeded max retries | `taskId`, `attempts`, `finalStatus` |
| `task.heartbeat` | Forwarded from agent | `taskId`, `agentId`, `timestamp` |
| `refinery.started` | A Refinery agent begins work | `taskId`, `agentId`, `mergeTargets` |
| `refinery.merged` | A Refinery successfully merges branches | `taskId`, `agentId`, `mergedBranches`, `resultRef` |
| `cr.emitted` | A Refinery emits a Change Request | `crId`, `refineryId`, `reason`, `scope` |
| `conflict.potential` | Walkthrough review detects a potential conflict | `taskId`, `riskDescription`, `relatedTasks` |
| `review.low_confidence` | Walkthrough confidence below threshold | `taskId`, `confidence`, `threshold` |
| `followup.spawned` | A dynamic follow-up agent is spawned | `followupId`, `sourceTaskId`, `reason` |

### Event envelope

Every event shares a common envelope (see `09-sdk-api.md` for the full specification):

```json
{
  "eventId": "evt_001",
  "seq": 1,
  "timestamp": "2026-02-09T14:32:01.442Z",
  "type": "task.started",
  "runId": "run-20260209-001",
  "taskId": "forge-task-0012",
  "data": {
    "agentId": "agent-a1b2c3",
    "type": "2",
    "branch": "forge/forge-task-0012/1"
  }
}
```

All events are appended to the run's NDJSON log at `.forge/runs/<runId>/events.ndjson`. See `09-sdk-api.md` for the full event type definitions and consumer API.
