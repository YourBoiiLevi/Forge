# 06 — Sandbox & Git Strategy

> How Forge provisions isolated execution environments and manages parallel Git workflows.

---

## 1. E2B Sandbox Architecture

### One Sandbox per Agent

Every agent (all types: 1, 2, 3, and refinery) runs inside its own dedicated [E2B](https://e2b.dev) sandbox. Sandboxes are **never shared** between agents — this guarantees full filesystem and process isolation. An agent's sandbox is the only environment in which that agent executes code, runs tests, and interacts with the repository.

### Boot Performance

- Sandbox boot time: **~150 ms** (from custom template; see [12-e2b-template.md](./12-e2b-template.md)).
- Boot is fast enough that sandboxes are created on-demand rather than pre-warmed.

### Runtime Limits

| Tier | Continuous Runtime Limit |
|------|--------------------------|
| Base | 1 hour                   |
| Pro  | 24 hours                 |

After the limit expires the sandbox is automatically destroyed unless it has been paused first.

### Pause / Resume

E2B exposes `betaPause()` and `Sandbox.connect(sandboxId)` for pause/resume.

- **Pausing** preserves both the filesystem **and** in-memory state (processes, open file handles, etc.).
- Pause cost: **~4 s per GiB RAM**.
- Resume cost: **~1 s**.
- After resume the runtime-limit clock **resets** — this enables arbitrarily long logical task durations.

### Auto-Pause

Sandboxes can be created with `autoPause` enabled:

```ts
const sandbox = await Sandbox.create(templateId, { autoPause: true });
```

When idle (no active commands / no SDK calls), the sandbox automatically pauses instead of being destroyed, allowing the executor to resume it later.

### Custom Template

All Forge sandboxes boot from a single custom E2B template that includes pre-installed toolchains, Git credentials, and common dependencies. See [12-e2b-template.md](./12-e2b-template.md) for the full template specification.

---

## 2. Sandbox Lifecycle

```
Executor spawns agent
        │
        ▼
  Create E2B sandbox (from custom template)
        │
        ▼
  Agent works (clone repo, checkout branch, execute task)
        │
        ├── Success ──► Push branch → Kill sandbox
        │
        ├── Timeout (long-running) ──► Auto-pause → Executor resumes later
        │
        └── Failure ──► Preserve sandbox for debugging (configurable)
                                │
                                ▼
                        Eventually kill sandbox
```

### Normal Flow

1. The executor spawns a worker agent for a task.
2. A new E2B sandbox is created from the custom template.
3. The agent performs its work inside the sandbox.
4. On completion the agent pushes its branch and signals `MERGE_READY`.
5. The sandbox is killed.

### Long-Running Tasks

If a task is expected to exceed the runtime limit, `autoPause` should be enabled. When the sandbox auto-pauses, the executor can later call `Sandbox.connect(sandboxId)` to resume. The runtime clock resets on resume.

### Failure Handling

On agent failure the sandbox is **preserved** (configurable via `preserveOnFailure: boolean` in task config) so that the executor or a human can inspect filesystem and process state. After inspection (or after a configurable TTL) the sandbox is killed.

### Sandbox Metadata

The following information is retrievable for every sandbox:

| Field        | Description                            |
|--------------|----------------------------------------|
| `sandboxId`  | Unique E2B sandbox identifier          |
| `templateId` | Template the sandbox was created from  |
| `metadata`   | Arbitrary key-value pairs (task ID, attempt ID, etc.) |
| `startedAt`  | Timestamp when the sandbox was created |
| `endAt`      | Timestamp when the sandbox expires     |

---

## 3. E2B SDK Usage (TypeScript)

All sandbox interactions go through the `@e2b/code-interpreter` SDK.

```ts
import { Sandbox } from '@e2b/code-interpreter';
```

### Create a Sandbox

```ts
const sandbox = await Sandbox.create(templateId, {
  timeoutMs: 60 * 60 * 1000, // 1 hour
  metadata: { taskId, attemptId },
});
```

### Run Terminal Commands

```ts
const result = await sandbox.commands.run('npm run build');
// result.stdout, result.stderr, result.exitCode
```

### Filesystem Operations

```ts
// Read
const content = await sandbox.files.read('/home/user/repo/src/index.ts');

// Write
await sandbox.files.write('/home/user/repo/src/index.ts', newContent);
```

### Pause

```ts
const sandboxId = await sandbox.betaPause();
// sandboxId is needed to resume later
```

### Resume

```ts
const sandbox = await Sandbox.connect(sandboxId);
```

### Terminate

```ts
await sandbox.kill();
```

### Extend Timeout

```ts
sandbox.setTimeout(30 * 60 * 1000); // extend by 30 minutes
```

---

## 4. Git Strategy

### Repository Requirement

The user **must** attach a GitHub repository to a Forge project. The repository can be:

- **Empty (greenfield)** — Forge creates all files from scratch.
- **Populated (brownfield)** — Forge works on top of existing code.

### Branch Naming Convention

```
forge/<taskId>/<attemptId>
```

- `taskId` — stable identifier for the task node in the DAG.
- `attemptId` — monotonically increasing integer per retry. Each retry of a task produces a **new branch**, keeping previous attempts available for inspection.

Examples:

```
forge/auth-login/1
forge/auth-login/2      ← retry
forge/api-routes/1
forge/refinery-v1/1
```

### Attempt-Scoped Branches

Every execution attempt of a task gets its own branch. This means:

- Retries never overwrite previous work.
- Debugging can compare attempt branches side by side.
- The executor always knows exactly which branch corresponds to which attempt.

### Dependency Merging — Per-Worker, Not Centralized

When a task depends on tasks A and B, the **worker itself** (not the executor) merges the branches for A and B into its own working branch before starting work.

```
forge/task-A/1  ─┐
                 ├──► worker merges into forge/task-C/1 before starting
forge/task-B/1  ─┘
```

This is a deliberate design decision:

- The executor does **not** perform merges. It only tells the worker which dependency branches to merge.
- Workers can spawn a **Type 1 sub-agent** (see [04-agent-types.md](./04-agent-types.md)) to handle the merge if the merge is non-trivial.

### No Immediate PR Merges

Branches are **not** merged into `main` (or any integration branch) immediately after a worker completes. Instead, branches accumulate until a **Refinery node** in the DAG handles integration. This keeps the main branch stable and allows the Refinery to resolve cross-cutting concerns.

### DAG Design Minimizes Conflicts

The planner is responsible for designing the DAG so that tasks with overlapping file concerns are **sequenced**, not parallelized. Cursor's research confirms that this strategy generally avoids merge conflicts in practice. Conflicts are the exception, not the norm.

### Decision Record: No Single Integration Branch

A "single integration branch" approach (where all workers merge into one shared branch) was evaluated and **rejected**. It serializes merges and kills parallelism — exactly the property Forge is designed to exploit.

---

## 5. Merge Policy

### Branch Creation

Each worker creates its own branch from the appropriate base:

- If the task has **no dependencies**: branch from `main` (or the user-specified base branch).
- If the task has **dependencies**: branch from `main`, then merge each dependency branch into the working branch before starting work.

### On Completion

1. Worker commits all changes with a structured commit message (see section 7).
2. Worker pushes the branch to the remote.
3. Task state transitions to `MERGE_READY`.

### MERGE_READY Semantics

`MERGE_READY` means the branch has been **pushed to the remote**. The gate is on the pushed ref, not merely on task completion. A task is not `MERGE_READY` until `git push` succeeds.

### Refinery Integration

Refinery nodes in the DAG handle actual integration:

1. Collect all `MERGE_READY` branches that feed into this Refinery node.
2. Merge them in DAG-topological order into an integration branch.
3. Run tests / validation on the integrated result.
4. If conflicts arise, spawn agents to fix them (see section 6).
5. On success, the integration branch is pushed and the Refinery task is marked complete.

---

## 6. Conflict Resolution

### During Dependency Merge (Worker)

1. Worker attempts to merge dependency branches into its working branch.
2. If a merge conflict occurs, the worker first attempts **auto-resolution** (e.g., `git merge -X theirs` for trivial cases, or heuristic-based resolution).
3. If auto-resolution fails, the worker spawns a **Type 1 sub-agent** dedicated to conflict resolution. The sub-agent has access to the conflicting files and the context of both branches.
4. If the sub-agent also fails, the task is marked `FAILED`. The executor can retry with a new attempt (new branch, fresh merge).

### During Refinery Integration

The Refinery has a dedicated `fix_conflict` tool that:

1. Identifies conflicting files.
2. Spawns one or more agents to resolve each conflict.
3. Validates the resolution (build + test).
4. Commits the resolution.

### Prevention

The best conflict resolution is **prevention**. The planner should:

- Assign tasks that touch the same files to the same sequential chain in the DAG.
- Split large tasks into smaller ones with clear file-boundary separation.
- Use Refinery nodes as synchronization points between independent branches of the DAG.

---

## 7. Git Operations in Sandbox

### Pre-Configuration

The custom E2B template (see [12-e2b-template.md](./12-e2b-template.md)) includes:

- Git installed and configured.
- GitHub credentials provisioned (PAT or GitHub App installation token injected at sandbox creation).
- Default git config (`user.name`, `user.email`) set to the Forge bot identity.

### Standard Operation Sequence

```bash
# 1. Clone the repository
git clone https://github.com/<owner>/<repo>.git /home/user/repo
cd /home/user/repo

# 2. Checkout or create the task branch
git checkout -b forge/<taskId>/<attemptId>

# 3. Merge dependency branches (if any)
git fetch origin forge/<depTaskId>/<depAttemptId>
git merge origin/forge/<depTaskId>/<depAttemptId> --no-edit

# 4. ... agent performs work ...

# 5. Commit changes
git add -A
git commit -m "forge(<taskId>): <summary>"

# 6. Push to remote
git push origin forge/<taskId>/<attemptId>
```

### Structured Commit Messages

```
forge(<taskId>): <short summary>

Attempt: <attemptId>
Task: <taskId>
Agent: <agentId>
```

### Retry / Backoff for Remote Operations

All remote git operations (`clone`, `fetch`, `push`) use **exponential backoff** with jitter:

| Attempt | Delay        |
|---------|--------------|
| 1       | 0 (immediate)|
| 2       | 1 s ± jitter |
| 3       | 2 s ± jitter |
| 4       | 4 s ± jitter |
| 5       | 8 s ± jitter |

Max retries: **5**. If all attempts fail, the operation is marked as failed and the task transitions to `FAILED`.

---

## 8. Branch Lifecycle

```
Created ──► Active ──► Pushed (MERGE_READY) ──► Merged (MERGED) ──► Cleaned
```

| State        | Description                                                       |
|--------------|-------------------------------------------------------------------|
| **Created**  | Agent starts working; branch created in sandbox via `git checkout -b`. |
| **Active**   | Agent is actively committing to the branch.                       |
| **Pushed**   | Agent completed work and pushed the branch to remote. Task is `MERGE_READY`. |
| **Merged**   | Refinery merged the branch into the integration branch. Task is `MERGED`. |
| **Cleaned**  | Branch deleted from remote after successful integration (optional; configurable). |

### Cleanup Policy

Branch cleanup is **optional** and configurable per project:

- `branchCleanup: 'immediate'` — delete remote branch immediately after merge.
- `branchCleanup: 'delayed'` — delete after a configurable TTL (default: 7 days).
- `branchCleanup: 'never'` — retain all branches indefinitely.

---

## Cross-References

- [12-e2b-template.md](./12-e2b-template.md) — Custom E2B template configuration (toolchains, credentials, pre-installed packages).
- [04-agent-types.md](./04-agent-types.md) — Agent type definitions (Type 1 sub-agents for conflict resolution, Type 2 workers).
- [03-executor-loop.md](./03-executor-loop.md) — Task state machine (`MERGE_READY`, `MERGED`, `FAILED` transitions).
