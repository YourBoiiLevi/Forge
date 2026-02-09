# 05 — Toolset Specification

> Every tool in Forge, its interface, parameters, return values, and agent-type access.
> All tools **auto-execute** — no preview or confirmation step.

Cross-references: [08-artifact-schemas.md](./08-artifact-schemas.md) (artifact formats) · [06-sandbox-git.md](./06-sandbox-git.md) (sandbox details) · [11-agent-core.md](./11-agent-core.md) (pi-agent-core tool registration)

---

## Access Summary

| Tool | Captain | Type 1 | Type 2 | Type 3 | Refinery | Executor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `write` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `edit` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `bash` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `plan_read` | ✓ | — | — | — | — | — |
| `plan_write` | ✓ | — | — | — | — | — |
| `plan_bash` | ✓ | — | — | — | — | — |
| `plan_edit` | ✓ | — | — | — | — | — |
| `web_search` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `web_fetch` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `create_spec` | ✓ | — | — | — | — | — |
| `create_task` | ✓ | — | — | — | — | — |
| `set_dag` | ✓ | — | — | — | — | — |
| `spawn_agent` | — | — | ✓¹ | ✓² | ✓³ | ✓⁴ |
| `emit_walkthrough` | — | ✓ | ✓ | ✓ | ✓ | — |
| `add_subtask` | — | — | — | ✓ | ✓ | — |
| `read_subtasks` | — | — | — | ✓ | ✓ | — |
| `merge_branches` | — | — | — | — | ✓ | — |
| `run_tests` | — | — | — | — | ✓ | — |
| `fix_conflict` | — | — | — | — | ✓ | — |
| `emit_cr` | — | — | — | — | ✓ | — |
| `read_spec` | — | — | — | — | — | ✓ |
| `read_task` | — | — | — | — | — | ✓ |
| `read_dag` | — | — | — | — | — | ✓ |
| `read_walkthrough` | — | — | — | — | — | ✓ |
| `mark_task_status` | — | — | — | — | — | ✓ |
| `prepare_branch` | — | — | — | — | — | ✓ |

¹ Type 2 may spawn **type 1** only.
² Type 3 may spawn **type 1 or 2**.
³ Refinery may spawn **type 1, 2, or 3**.
⁴ Executor may spawn **all types**.

---

## 1 · File & Code Tools

These tools operate against the **real E2B sandbox filesystem**.

### 1.1 `read`

Read file contents from the sandbox filesystem.

```ts
// Parameters
interface ReadParams {
  path: string;          // Absolute path inside the sandbox
  range?: [number, number]; // Optional 1-indexed [startLine, endLine]
}

// Returns
interface ReadResult {
  content: string;       // File contents (full or sliced to range)
  totalLines: number;    // Total line count of the file
}
```

**Access:** Captain, Type 1, Type 2, Type 3, Refinery

---

### 1.2 `write`

Full-file replacement. Creates the file (and intermediate directories) if it does not exist.

```ts
// Parameters
interface WriteParams {
  path: string;    // Absolute path inside the sandbox
  content: string; // Complete file content
}

// Returns
interface WriteResult {
  success: boolean;
  bytesWritten: number;
}
```

**Access:** Captain, Type 1, Type 2, Type 3, Refinery

---

### 1.3 `edit`

Diff-based file editing. Locates `oldStr` in the file and replaces it with `newStr`. Fails if `oldStr` is not found or matches more than once.

```ts
// Parameters
interface EditParams {
  path: string;    // Absolute path inside the sandbox
  oldStr: string;  // Exact text to find
  newStr: string;  // Replacement text
}

// Returns
interface EditResult {
  success: boolean;
  diff: string;    // Unified diff of the change
}
```

**Access:** Captain, Type 1, Type 2, Type 3, Refinery

---

### 1.4 `bash`

Execute a bash command inside the real E2B sandbox. Has access to all installed binaries, the network, and the full filesystem.

```ts
// Parameters
interface BashParams {
  command: string;    // Shell command to execute
  timeout?: number;   // Timeout in milliseconds (default: sandbox-level default)
}

// Returns
interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

**Access:** Captain, Type 1, Type 2, Type 3, Refinery

---

## 2 · Planning Tools (Captain Only)

Planning tools operate against the **just-bash** in-memory/overlay filesystem simulation. There is no real shell process and no binary execution — `just-bash` is a TypeScript-implemented bash interpreter with an in-memory FS. It supports common coreutils (`find`, `grep`, `cat`, `mkdir`, `jq`, etc.), pipes, and redirections.

### 2.1 `plan_read`

Read a file from the just-bash simulation filesystem.

```ts
// Parameters
interface PlanReadParams {
  path: string; // Path inside the simulation FS
}

// Returns
interface PlanReadResult {
  content: string;
}
```

**Access:** Captain

---

### 2.2 `plan_write`

Write a file to the just-bash simulation filesystem. Creates intermediate directories.

```ts
// Parameters
interface PlanWriteParams {
  path: string;
  content: string;
}

// Returns
interface PlanWriteResult {
  success: boolean;
}
```

**Access:** Captain

---

### 2.3 `plan_bash`

Execute a bash command inside the just-bash TypeScript interpreter. No real shell process is involved — only the built-in command set is available. Binary execution is not supported.

Supported features: `find`, `grep`, `jq`, `cat`, `echo`, `mkdir`, `ls`, `rm`, `cp`, `mv`, `sed`, `awk`, `head`, `tail`, `wc`, `sort`, `uniq`, `tr`, `cut`, pipes (`|`), redirections (`>`, `>>`), subshells, and variable expansion.

```ts
// Parameters
interface PlanBashParams {
  command: string;
}

// Returns
interface PlanBashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

**Access:** Captain

---

### 2.4 `plan_edit`

Diff-based editing in the just-bash simulation filesystem.

```ts
// Parameters
interface PlanEditParams {
  path: string;
  oldStr: string;
  newStr: string;
}

// Returns
interface PlanEditResult {
  success: boolean;
}
```

**Access:** Captain

---

## 3 · Web Tools

Web access is available to **all agent types** (workers included). Both tools proxy through the Exa AI API.

### 3.1 `web_search`

Search the web via the Exa AI search endpoint (`POST https://api.exa.ai/search`).

```ts
// Parameters
interface WebSearchParams {
  query: string;
  numResults?: number;          // Default: 10
  includeDomains?: string[];    // Restrict to specific domains
  category?: string;            // e.g. "company", "research paper", "tweet", "news"
}

// Returns
interface WebSearchResult {
  results: Array<{
    title: string;
    url: string;
    publishedDate?: string;     // ISO 8601
    text?: string;              // Snippet / extracted text
    summary?: string;           // AI-generated summary (if requested)
  }>;
}
```

**Access:** Captain, Type 1, Type 2, Type 3, Refinery

---

### 3.2 `web_fetch`

Fetch a page's content via the Exa AI contents endpoint (`POST https://api.exa.ai/contents`). Returns the page body converted to markdown.

```ts
// Parameters
interface WebFetchParams {
  url: string;
}

// Returns
interface WebFetchResult {
  title: string;
  content: string;   // Markdown-rendered page content
  url: string;       // Canonical / resolved URL
}
```

**Access:** Captain, Type 1, Type 2, Type 3, Refinery

---

## 4 · Artifact Tools (Captain Only)

These tools write to the **centralized artifact store** at `artifacts/<runId>/`.

### 4.1 `create_spec`

Create a spec document.

```ts
// Parameters
interface CreateSpecParams {
  filename: string;   // e.g. "api-design.md"
  content: string;    // Full spec content (markdown)
}

// Returns
interface CreateSpecResult {
  path: string;       // artifacts/<runId>/specs/<filename>
}
```

**Writes to:** `artifacts/<runId>/specs/<filename>`
**Access:** Captain

---

### 4.2 `create_task`

Create a task document with YAML frontmatter (id, type, dependencies, status, etc.).

```ts
// Parameters
interface CreateTaskParams {
  taskId: string;     // Unique task identifier
  content: string;    // Full document including YAML frontmatter
}

// Returns
interface CreateTaskResult {
  path: string;       // artifacts/<runId>/tasks/<taskId>.md
}
```

**Writes to:** `artifacts/<runId>/tasks/<taskId>.md`
**Access:** Captain

---

### 4.3 `set_dag`

Write the full DAG (directed acyclic graph) describing task dependencies and execution order.

```ts
// Parameters
interface SetDagParams {
  dag: object;        // The complete DAG JSON (see 08-artifact-schemas.md)
}

// Returns
interface SetDagResult {
  path: string;       // artifacts/<runId>/dag.json
}
```

**Writes to:** `artifacts/<runId>/dag.json`
**Access:** Captain

---

## 5 · Agent Management Tools

### 5.1 `spawn_agent`

Spawn a sub-agent of the specified type. The spawned agent receives its own E2B sandbox.

```ts
// Parameters
interface SpawnAgentParams {
  type: 1 | 2 | 3 | 'refinery';
  taskId: string;              // Task the agent will work on
  config?: object;             // Optional overrides (model, timeout, etc.)
}

// Returns
interface SpawnAgentResult {
  agentId: string;             // Unique identifier for the spawned agent
  sandboxId: string;           // E2B sandbox ID assigned to the agent
}
```

**Access & spawn constraints:**

| Caller | May spawn |
|---|---|
| Type 2 | Type 1 |
| Type 3 | Type 1, Type 2 |
| Refinery | Type 1, Type 2, Type 3 |
| Executor | Type 1, Type 2, Type 3, Refinery |

---

### 5.2 `emit_walkthrough`

Write a `walkthrough.md` for the current task and attempt. The walkthrough documents what the agent did, decisions made, and files touched.

```ts
// Parameters
interface EmitWalkthroughParams {
  walkthrough: WalkthroughData; // See 08-artifact-schemas.md for shape
}

// Returns
interface EmitWalkthroughResult {
  path: string; // artifacts/<runId>/<taskId>/<attemptId>/walkthrough.md
}
```

**Writes to:** `artifacts/<runId>/<taskId>/<attemptId>/walkthrough.md`
**Access:** Type 1, Type 2, Type 3, Refinery

---

## 6 · Sub-executor Tools (Type 3 & Refinery Only)

### 6.1 `add_subtask`

Add a subtask to the agent's persisted task list. Used by Type 3 and Refinery agents to break work down further within their own scope.

```ts
// Parameters
interface AddSubtaskParams {
  title: string;
  description: string;
  type?: 1 | 2;        // Agent type to assign (default: 1)
}

// Returns
interface AddSubtaskResult {
  subtaskId: string;
}
```

**Stored in:** `artifacts/<runId>/<taskId>/subtasks/`
**Access:** Type 3, Refinery

---

### 6.2 `read_subtasks`

Read the agent's persisted subtask list.

```ts
// Parameters — none
interface ReadSubtasksParams {}

// Returns
interface ReadSubtasksResult {
  subtasks: Array<{
    subtaskId: string;
    title: string;
    description: string;
    type: 1 | 2;
    status: string;
  }>;
}
```

**Access:** Type 3, Refinery

---

## 7 · Refinery-Only Tools

### 7.1 `merge_branches`

Merge one or more source branches into a target branch inside the Refinery's sandbox.

```ts
// Parameters
interface MergeBranchesParams {
  sourceBranches: string[];   // Branches to merge
  targetBranch: string;       // Target branch
}

// Returns
interface MergeBranchesResult {
  success: boolean;
  conflicts?: string[];       // List of conflicting file paths (if any)
}
```

**Access:** Refinery

---

### 7.2 `run_tests`

Run the project's test suite inside the sandbox.

```ts
// Parameters
interface RunTestsParams {
  command?: string;   // Override test command (default: auto-detected or from config)
}

// Returns
interface RunTestsResult {
  passed: boolean;
  output: string;             // Full stdout/stderr from the test run
  testResults: Array<{
    name: string;
    result: 'pass' | 'fail';
  }>;
}
```

**Access:** Refinery

---

### 7.3 `fix_conflict`

Spawn a dedicated agent to resolve merge conflicts in the specified files.

```ts
// Parameters
interface FixConflictParams {
  conflictFiles: string[];    // Files with conflict markers
  sourceBranch: string;
  targetBranch: string;
}

// Returns
interface FixConflictResult {
  success: boolean;
  agentId: string;            // ID of the spawned conflict-resolution agent
}
```

**Access:** Refinery

---

### 7.4 `emit_cr`

Emit a Change Request back to the main plan. This is used when the Refinery detects that the original plan needs revision (e.g., missing dependency, architectural issue).

**Side effect:** Halts the execution loop — no new tasks are dispatched, but currently running tasks are allowed to complete.

```ts
// Parameters
interface EmitCrParams {
  title: string;
  description: string;
  reason: string;
  suggestedChanges?: string;  // Optional markdown describing proposed fixes
}

// Returns
interface EmitCrResult {
  crId: string;               // Unique Change Request identifier
}
```

**Access:** Refinery

---

## 8 · Executor Tools

The Executor has **read-only** access to artifacts and the ability to transition task status.

### 8.1 `read_spec`

```ts
// Parameters
interface ReadSpecParams { filename: string; }
// Returns
interface ReadSpecResult { content: string; }
```

### 8.2 `read_task`

```ts
// Parameters
interface ReadTaskParams { taskId: string; }
// Returns
interface ReadTaskResult { content: string; }
```

### 8.3 `read_dag`

```ts
// Parameters — none
interface ReadDagParams {}
// Returns
interface ReadDagResult { dag: object; }
```

### 8.4 `read_walkthrough`

```ts
// Parameters
interface ReadWalkthroughParams { taskId: string; attemptId?: string; }
// Returns
interface ReadWalkthroughResult { content: string; }
```

### 8.5 `mark_task_status`

Transition a task's status in the task state machine.

```ts
// Parameters
interface MarkTaskStatusParams {
  taskId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'MERGE_READY' | 'MERGED' | 'FAILED' | 'STALE';
}

// Returns
interface MarkTaskStatusResult {
  success: boolean;
  previousStatus: string;
}
```

Valid transitions are enforced by the state machine (see executor spec).

**Access:** Executor

---

### 8.6 `prepare_branch`

Create and configure the task branch for an agent. This tool:
1. Creates a new branch `forge/<taskId>/<attemptId>` from the appropriate base ref
2. If the task has dependencies, merges all dependency branches into the working branch
3. Returns the branch name and base ref for the agent to use

```ts
// Parameters
interface PrepareBranchParams {
  taskId: string;
  attemptId: number;
}

// Returns
interface PrepareBranchResult {
  branch: string;      // e.g., "forge/task-001/1"
  baseRef: string;     // e.g., "main"
  mergedDeps?: string[];  // List of dependency branches that were merged (if any)
}
```

**Access:** Executor

---

## 9 · Implementation Notes

1. **Auto-execution.** All tools execute immediately upon invocation — there is no preview or confirmation step.

2. **Atomic artifact writes.** Tools that write to the artifact store use a write-to-`.tmp`-then-rename strategy to prevent partial reads by concurrent consumers.

3. **Artifact store transport.** Tools that interact with the centralized artifact store translate their operations into just-bash commands targeting the store's filesystem.

4. **NDJSON event emission.** Every tool invocation emits two events:
   - `tool.call` — logged before execution with tool name and parameters.
   - `tool.result` — logged after execution with the return value (or error).

5. **Parameter validation.** All tool parameters are validated at invocation time using **TypeBox** schemas, following the pattern established in `pi-agent-core`. Invalid parameters produce an immediate error result without executing the tool.

6. **Error handling.** Tools return structured errors (not thrown exceptions). The agent receives the error in the normal tool result and decides how to proceed.
