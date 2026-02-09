# 09 — SDK & API Design

> Forge's backend orchestration logic is entirely programmatically controllable via a REST API and a TypeScript SDK that wraps it. Every state mutation and query available to the web interface goes through these endpoints — the UI is just another SDK consumer.

Cross-reference: [08-artifact-schemas.md](./08-artifact-schemas.md) for data schemas, [10-web-interface.md](./10-web-interface.md) for frontend consumption, [03-executor-loop.md](./03-executor-loop.md) for event emission.

---

## 1 REST API Endpoints

Base URL: `http://localhost:<port>/api/v1`

All request and response bodies are JSON (`Content-Type: application/json`) unless otherwise noted. All endpoints return the standard error envelope on failure (§4).

---

### 1.1 Runs

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Create a new run |
| `GET` | `/runs/:runId` | Get run state |
| `GET` | `/runs/:runId/stream` | NDJSON event stream |
| `POST` | `/runs/:runId/pause` | Pause run |
| `POST` | `/runs/:runId/resume` | Resume paused run |

#### `POST /runs`

Create a new run. Attaches a GitHub repo and starts the Captain interview phase.

**Request body:**

```jsonc
{
  "repoUrl": "https://github.com/org/repo",  // required
  "model": "claude-sonnet-4-20250514"                    // optional, default from config
}
```

**Response `201 Created`:**

```jsonc
{
  "runId": "run_a1b2c3d4",
  "status": "planning"
}
```

#### `GET /runs/:runId`

Returns the full `RunState` object as defined in 08-artifact-schemas.md.

**Response `200 OK`:**

```jsonc
{
  "runId": "run_a1b2c3d4",
  "status": "executing",
  "repoUrl": "https://github.com/org/repo",
  "model": "claude-sonnet-4-20250514",
  "createdAt": "2026-02-09T12:00:00Z",
  "tasks": { /* ... */ },
  "dag": { /* ... */ },
  "artifacts": { /* ... */ }
}
```

#### `GET /runs/:runId/stream`

Long-lived NDJSON event stream. Returns `Content-Type: application/x-ndjson` with chunked transfer encoding.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `after` | `string` | Event ID to resume from. Only events after this ID are sent. |

The connection stays open until the run completes, the client disconnects, or an error occurs. The server sends periodic keepalive comments (`:\n`) to prevent proxy timeouts.

**Response `200 OK`:**

```
{"eventId":"evt_001","seq":1,"timestamp":"2026-02-09T12:00:01Z","type":"run.started","runId":"run_a1b2c3d4","data":{"repoUrl":"https://github.com/org/repo"}}
{"eventId":"evt_002","seq":2,"timestamp":"2026-02-09T12:00:02Z","type":"captain.message","runId":"run_a1b2c3d4","data":{"content":"What should I build?","role":"assistant"}}
```

#### `POST /runs/:runId/pause`

Emergency button. No new tasks are scheduled; running tasks receive a steering signal to wrap up gracefully.

**Response `200 OK`:**

```jsonc
{ "status": "paused" }
```

Returns `409 Conflict` if the run is already paused or completed.

#### `POST /runs/:runId/resume`

Resume a previously paused run. Task scheduling resumes from where it left off.

**Response `200 OK`:**

```jsonc
{ "status": "executing" }
```

Returns `409 Conflict` if the run is not paused.

---

### 1.2 Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs/:runId/tasks` | List tasks |
| `GET` | `/runs/:runId/tasks/:taskId` | Get task detail |

#### `GET /runs/:runId/tasks`

Returns an array of task summaries for the run.

**Response `200 OK`:**

```jsonc
[
  {
    "taskId": "task_01",
    "title": "Set up Express server",
    "type": 2,
    "status": "DONE",
    "dependencies": [],
    "branch": "forge/task_01-express-server"
  },
  {
    "taskId": "task_02",
    "title": "Implement auth middleware",
    "type": 2,
    "status": "RUNNING",
    "dependencies": ["task_01"],
    "branch": "forge/task_02-auth-middleware"
  }
]
```

#### `GET /runs/:runId/tasks/:taskId`

Returns full task details including walkthrough content and subtask breakdown.

**Response `200 OK`:**

```jsonc
{
  "taskId": "task_01",
  "title": "Set up Express server",
  "type": 2,
  "status": "MERGED",
  "dependencies": [],
  "branch": "forge/task_01-express-server",
  "agentId": "agent_abc",
  "sandboxId": "sbx_xyz",
  "startedAt": "2026-02-09T12:01:00Z",
  "completedAt": "2026-02-09T12:05:30Z",
  "walkthrough": "## Express Server Setup\n\nCreated `src/server.ts` with ...",
  "subtasks": [
    { "title": "Install dependencies", "done": true },
    { "title": "Create server entry point", "done": true },
    { "title": "Add health check route", "done": true }
  ],
  "artifacts": [
    ".forge/tasks/task_01.md",
    ".forge/walkthroughs/task_01-walkthrough.md"
  ]
}
```

---

### 1.3 Artifacts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs/:runId/artifacts/:path` | Fetch artifact content |

#### `GET /runs/:runId/artifacts/:path`

Fetch raw artifact content by path. The `:path` parameter is the artifact path relative to the `.forge/` directory (e.g., `specs/api-spec.md`, `tasks/task_01.md`).

**Response `200 OK`:**

Returns raw file content. `Content-Type` is set based on file extension:
- `.md` → `text/markdown`
- `.json` → `application/json`
- `.yaml` / `.yml` → `text/yaml`
- Default → `text/plain`

Returns `404 Not Found` if the artifact does not exist.

---

### 1.4 Change Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs/:runId/change-requests` | List change requests |
| `POST` | `/runs/:runId/change-requests/:crId/approve` | Approve a CR |

#### `GET /runs/:runId/change-requests`

Returns all change requests for the run.

**Response `200 OK`:**

```jsonc
[
  {
    "crId": "cr_001",
    "title": "Add rate limiting to auth endpoint",
    "emittedBy": "task_02",
    "status": "pending",
    "description": "The auth endpoint should have rate limiting ...",
    "impact": ["task_03", "task_04"],
    "createdAt": "2026-02-09T12:03:00Z"
  }
]
```

#### `POST /runs/:runId/change-requests/:crId/approve`

Approve a pending change request. This triggers Captain to perform a mini-replan or applies the change directly depending on impact scope.

**Response `200 OK`:**

```jsonc
{ "status": "approved" }
```

Returns `404` if the CR does not exist, `409` if the CR is not in `pending` status.

---

### 1.5 Captain Messaging

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/captain/message` | Send message to Captain |

#### `POST /captain/message`

Send a user message to Captain during the interview phase. The response streams back via the run's NDJSON event stream as `captain.message` events.

**Request body:**

```jsonc
{
  "runId": "run_a1b2c3d4",
  "message": "Build a REST API with user authentication and a React dashboard"
}
```

**Response `202 Accepted`:**

```jsonc
{ "acknowledged": true }
```

The actual Captain response arrives as events on the `GET /runs/:runId/stream` endpoint. Returns `409` if the run is not in the `planning` phase.

---

## 2 NDJSON Event Stream Format

Every event emitted by Forge is a single JSON line terminated by `\n`. Events are delivered over the `GET /runs/:runId/stream` endpoint.

### 2.1 Base Event Structure

```typescript
interface ForgeEvent {
  eventId: string;        // UUID — globally unique event identifier
  seq: number;            // monotonic sequence number, per-run, gap-free
  timestamp: string;      // ISO 8601 with timezone (e.g., "2026-02-09T12:00:01.123Z")
  type: EventType;        // discriminated union tag
  runId: string;          // owning run
  taskId?: string;        // present for task-scoped events
  attemptId?: string;     // present when a task has been retried
  data: Record<string, unknown>;  // type-specific payload
}
```

`seq` is a monotonic, gap-free, per-run integer starting at 1. Clients use `seq` for ordering and `eventId` for deduplication and resume (`?after=<eventId>`).

### 2.2 Event Types

```typescript
type EventType =
  // Run lifecycle
  | 'run.started'
  | 'run.paused'
  | 'run.completed'

  // Captain (planning phase)
  | 'captain.message'
  | 'captain.tool_call'
  | 'captain.tool_result'
  | 'plan.finalized'

  // Task lifecycle
  | 'task.scheduled'
  | 'task.started'
  | 'task.heartbeat'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'

  // Agent tool calls
  | 'tool.call'
  | 'tool.result'

  // Artifacts & branches
  | 'artifact.written'
  | 'branch.pushed'

  // Refinery
  | 'refinery.started'
  | 'refinery.merged'

  // Change requests
  | 'cr.emitted';
```

### 2.3 Event Data Payloads

#### Run lifecycle

| Type | Data |
|------|------|
| `run.started` | `{ repoUrl: string }` |
| `run.paused` | `{ reason: 'user' \| 'cr' }` |
| `run.completed` | `{ totalCompleted: number, totalFailed: number, duration: number }` |

#### Captain

| Type | Data |
|------|------|
| `captain.message` | `{ content: string, role: 'assistant' }` |
| `captain.tool_call` | `{ toolName: string, args: Record<string, unknown> }` |
| `captain.tool_result` | `{ toolName: string, result: unknown }` |
| `plan.finalized` | `{ totalTasks: number, totalRefineries: number, specCount: number }` |

#### Task lifecycle

| Type | Data |
|------|------|
| `task.scheduled` | `{ taskId: string, agentType: 1 \| 2 \| 3 \| 'refinery' }` |
| `task.started` | `{ taskId: string, agentId: string, sandboxId: string, branch: string }` |
| `task.heartbeat` | `{ taskId: string, agentId: string, uptimeSeconds: number }` |
| `task.progress` | `{ taskId: string, content: string, contentType: 'text' \| 'thinking' }` |
| `task.completed` | `{ taskId: string, walkthroughPath: string }` |
| `task.failed` | `{ taskId: string, error: string, canRetry: boolean }` |

#### Agent tool calls

| Type | Data |
|------|------|
| `tool.call` | `{ taskId: string, toolName: string, args: Record<string, unknown> }` |
| `tool.result` | `{ taskId: string, toolName: string, result: unknown, isError: boolean }` |

#### Artifacts & branches

| Type | Data |
|------|------|
| `artifact.written` | `{ path: string, type: 'spec' \| 'task' \| 'walkthrough' \| 'cr' \| 'dag' }` |
| `branch.pushed` | `{ taskId: string, branch: string, ref: string }` |

#### Refinery

| Type | Data |
|------|------|
| `refinery.started` | `{ taskId: string, dependencyCount: number }` |
| `refinery.merged` | `{ taskId: string, mergedBranches: string[], conflicts: string[] }` |

#### Change requests

| Type | Data |
|------|------|
| `cr.emitted` | `{ crId: string, title: string, emittedBy: string }` |

---

## 3 TypeScript SDK

The SDK is the only supported client library. It wraps every REST endpoint and exposes the event stream as an `AsyncIterable`.

### 3.1 Installation

```bash
npm install @forge/sdk
```

### 3.2 Client Class

```typescript
class ForgeSDK {
  constructor(baseUrl: string);

  // ── Runs ──────────────────────────────────────────────
  createRun(repoUrl: string, options?: { model?: string }): Promise<Run>;
  getRun(runId: string): Promise<RunState>;
  streamEvents(runId: string, options?: { after?: string }): AsyncIterable<ForgeEvent>;
  pauseRun(runId: string): Promise<void>;
  resumeRun(runId: string): Promise<void>;

  // ── Captain ───────────────────────────────────────────
  sendCaptainMessage(runId: string, message: string): Promise<void>;

  // ── Tasks ─────────────────────────────────────────────
  listTasks(runId: string): Promise<TaskSummary[]>;
  getTask(runId: string, taskId: string): Promise<TaskDetail>;

  // ── Artifacts ─────────────────────────────────────────
  getArtifact(runId: string, path: string): Promise<string>;

  // ── Change Requests ───────────────────────────────────
  listChangeRequests(runId: string): Promise<ChangeRequest[]>;
  approveChangeRequest(runId: string, crId: string): Promise<void>;
}
```

### 3.3 Return Types

```typescript
interface Run {
  runId: string;
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
}

interface TaskSummary {
  taskId: string;
  title: string;
  type: 1 | 2 | 3 | 'refinery';
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'MERGE_READY' | 'MERGED' | 'FAILED' | 'STALE';
  dependencies: string[];
  branch?: string;
}

interface TaskDetail extends TaskSummary {
  agentId?: string;
  sandboxId?: string;
  startedAt?: string;
  completedAt?: string;
  walkthrough?: string;
  subtasks?: { title: string; done: boolean }[];
  artifacts: string[];
}

interface ChangeRequest {
  crId: string;
  title: string;
  emittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  description: string;
  impact: string[];
  createdAt: string;
}
```

### 3.4 Usage Examples

#### Create a run and stream events

```typescript
import { ForgeSDK } from '@forge/sdk';

const forge = new ForgeSDK('http://localhost:3000/api/v1');

const run = await forge.createRun('https://github.com/org/repo', {
  model: 'claude-sonnet-4-20250514',
});

for await (const event of forge.streamEvents(run.runId)) {
  switch (event.type) {
    case 'captain.message':
      console.log(`Captain: ${event.data.content}`);
      break;
    case 'task.started':
      console.log(`Task ${event.data.taskId} started on branch ${event.data.branch}`);
      break;
    case 'task.completed':
      console.log(`Task ${event.data.taskId} done`);
      break;
    case 'run.completed':
      console.log(`Run finished: ${event.data.totalCompleted} tasks completed`);
      break;
  }
}
```

#### Interact with Captain during planning

```typescript
const run = await forge.createRun('https://github.com/org/repo');

// Send a message to Captain
await forge.sendCaptainMessage(run.runId, 'Build a REST API with JWT auth');

// Listen for Captain's response on the event stream
for await (const event of forge.streamEvents(run.runId)) {
  if (event.type === 'captain.message') {
    console.log(event.data.content);
  }
  if (event.type === 'plan.finalized') {
    break; // planning done, execution begins
  }
}
```

#### Resume a disconnected stream

```typescript
let lastEventId: string | undefined;

async function listen(runId: string) {
  for await (const event of forge.streamEvents(runId, { after: lastEventId })) {
    lastEventId = event.eventId;
    handleEvent(event);
  }
  // Connection dropped — reconnect
  listen(runId);
}
```

#### Pause, inspect, resume

```typescript
await forge.pauseRun(runId);

const tasks = await forge.listTasks(runId);
const executing = tasks.filter(t => t.status === 'executing');
console.log(`${executing.length} tasks wrapping up...`);

const crs = await forge.listChangeRequests(runId);
for (const cr of crs.filter(c => c.status === 'pending')) {
  console.log(`Pending CR: ${cr.title}`);
  await forge.approveChangeRequest(runId, cr.crId);
}

await forge.resumeRun(runId);
```

---

## 4 Error Handling

### 4.1 Standard Error Envelope

All endpoints return errors in this format:

```typescript
interface ForgeError {
  error: string;        // human-readable message
  code: string;         // machine-readable error code
  details?: unknown;    // optional additional context
}
```

### 4.2 HTTP Status Codes

| Status | Meaning | Example |
|--------|---------|---------|
| `400` | Bad Request | Missing `repoUrl` in `POST /runs` |
| `404` | Not Found | Run or task does not exist |
| `409` | Conflict | Invalid state transition (pausing an already paused run) |
| `500` | Internal Error | Unexpected server failure |

### 4.3 Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Request body fails validation |
| `RUN_NOT_FOUND` | Run ID does not exist |
| `TASK_NOT_FOUND` | Task ID does not exist in run |
| `ARTIFACT_NOT_FOUND` | Artifact path does not exist |
| `CR_NOT_FOUND` | Change request ID does not exist |
| `INVALID_STATE` | Operation not valid for current run/task state |
| `INTERNAL_ERROR` | Unexpected server-side failure |

### 4.4 SDK Error Handling

The SDK throws typed errors:

```typescript
class ForgeAPIError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public details?: unknown,
  ) {
    super(`[${code}] ${message}`);
  }
}
```

```typescript
try {
  await forge.pauseRun('run_nonexistent');
} catch (err) {
  if (err instanceof ForgeAPIError && err.code === 'RUN_NOT_FOUND') {
    // handle gracefully
  }
}
```

### 4.5 Event Stream Errors

Agent failures are surfaced as `task.failed` events on the stream rather than HTTP errors. The stream connection itself uses standard HTTP error codes if the initial connection fails.

---

## 5 Streaming Implementation

### 5.1 Server Side (Express.js)

```typescript
app.get('/api/v1/runs/:runId/stream', (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const afterEventId = req.query.after as string | undefined;

  // Replay buffered events if resuming
  const replayEvents = eventBuffer.getAfter(req.params.runId, afterEventId);
  for (const event of replayEvents) {
    res.write(JSON.stringify(event) + '\n');
  }

  // Subscribe to live events
  const unsubscribe = eventBus.subscribe(req.params.runId, (event) => {
    res.write(JSON.stringify(event) + '\n');
  });

  // Keepalive every 15 seconds
  const keepalive = setInterval(() => {
    res.write(': keepalive\n');
  }, 15_000);

  req.on('close', () => {
    unsubscribe();
    clearInterval(keepalive);
  });
});
```

### 5.2 Event Buffer

The server maintains an in-memory circular buffer of events per run (default: last 10,000 events). This allows clients to reconnect with `?after=<eventId>` and receive missed events without data loss during brief disconnections.

```typescript
interface EventBuffer {
  append(runId: string, event: ForgeEvent): void;
  getAfter(runId: string, afterEventId?: string): ForgeEvent[];
  clear(runId: string): void;
}
```

When a run completes, its buffer is retained for 1 hour before being garbage collected.

### 5.3 Client Side (SDK)

The SDK's `streamEvents` method uses `fetch` with streaming body parsing:

```typescript
async *streamEvents(runId: string, options?: { after?: string }): AsyncIterable<ForgeEvent> {
  const url = new URL(`${this.baseUrl}/runs/${runId}/stream`);
  if (options?.after) url.searchParams.set('after', options.after);

  const response = await fetch(url.toString());
  if (!response.ok) throw await this.parseError(response);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // keep incomplete line in buffer

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue; // skip empty lines and keepalives
      yield JSON.parse(line) as ForgeEvent;
    }
  }
}
```

---

## 6 CORS & Security

### 6.1 MVP Scope

Forge is a local-only prototype. There is no authentication or authorization for the MVP.

### 6.2 CORS Configuration

CORS headers are configured to allow localhost origins on any port:

```typescript
app.use(cors({
  origin: /^https?:\/\/localhost(:\d+)?$/,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
```

### 6.3 Future Considerations

Post-MVP, the API will need:
- API key authentication via `Authorization: Bearer <key>` header
- Rate limiting per API key
- Request signing for webhook callbacks
- TLS termination for non-localhost deployments

These are out of scope for the initial implementation.

---

## 7 Design Invariants

1. **UI is an SDK consumer.** The web interface uses `ForgeSDK` exclusively — no direct HTTP calls or backdoor state access.
2. **Events are the source of truth.** The event stream is the canonical log of everything that happened in a run. The REST endpoints for run/task state are derived views.
3. **Resumable streams.** A client must be able to disconnect and reconnect without missing events, using `?after=<eventId>`.
4. **Idempotent reads.** All `GET` endpoints are safe to retry and cache. `POST` endpoints for mutations are not idempotent.
5. **Typed everything.** Every request body, response body, and event payload has a corresponding TypeScript interface exported from the SDK package.
