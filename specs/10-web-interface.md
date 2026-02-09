# 10 — Web Interface

> Forge's browser-based control surface. Brutalist industrial design. Raw, honest, functional.

Cross-reference: [09-sdk-api.md](./09-sdk-api.md) for API endpoints and event types, [08-artifact-schemas.md](./08-artifact-schemas.md) for data formats.

---

## 1. Design System

### 1.1 Philosophy

Brutalist industrial design. Every element exists because it conveys information or accepts input. No decoration for decoration's sake. The interface should feel like a factory control panel — dense, functional, legible under pressure. If a visual element doesn't help the operator make a decision or understand state, it doesn't belong.

### 1.2 Color Palette

| Token               | Hex       | Usage                                                        |
|----------------------|-----------|--------------------------------------------------------------|
| `--bg-primary`       | `#0A0A0A` | Primary background. Carbon black.                            |
| `--bg-surface`       | `#1A1A1A` | Cards, panels, raised surfaces.                              |
| `--border`           | `#2A2A2A` | All borders. No shadows — borders are the only separator.    |
| `--text-primary`     | `#E0E0E0` | Off-white. Body text, labels, values.                        |
| `--text-secondary`   | `#808080` | Mid-gray. Metadata, timestamps, de-emphasized content.       |
| `--accent`           | `#FF6B00` | Forge orange. Active states, current task, primary actions.   |
| `--success`          | `#00FF41` | Terminal green. Passed tests, completed tasks, healthy state. |
| `--error`            | `#FF3333` | Failures, conflicts, blocked states.                         |
| `--warning`          | `#FFAA00` | Amber. Stale tasks, degraded states, caution indicators.     |

Usage rules:

- `--accent` (Forge orange) is used **sparingly**: active/running states, the primary action button, the "pause all" button, current selection indicators, and warnings that demand immediate attention.
- Backgrounds are always `--bg-primary` or `--bg-surface`. Never lighter.
- Text is always `--text-primary` or `--text-secondary`. Never pure white (`#FFFFFF`).
- Status colors (`--success`, `--error`, `--warning`) are used exclusively for status indication — never for decoration.

### 1.3 Typography

| Role            | Font          | Usage                                                              |
|-----------------|---------------|--------------------------------------------------------------------|
| Accent / Display | **Geist-Pixel** | Headings, labels, status indicators, key UI elements, nav items. |
| Body / Mono      | **Geist Mono**  | Everything else — agent output, code, descriptions, data, tables.|

- Font loading: Geist-Pixel and Geist Mono loaded from Vercel's font CDN (`https://cdn.vercel.com/geist/...`) or bundled locally as a fallback.
- Fallback stack: `"Geist Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace`.
- No serif fonts anywhere. No sans-serif body text. Everything is mono or pixel.
- Base font size: 13px. Line height: 1.5 for body, 1.2 for headings.

### 1.4 Design Elements

**Geometry:**

- Sharp edges everywhere. `border-radius: 0` by default. Maximum `2px` only where browser rendering artifacts demand it.
- No rounded buttons, no pill shapes, no circles (except status LED dots).
- Rectangular everything. Panels, buttons, inputs, cards — all hard-cornered.

**Surfaces:**

- No gradients. Flat colors only. A surface is one color.
- No box shadows. Separation is achieved exclusively with `1px solid var(--border)` borders.
- No blur effects, no frosted glass, no transparency beyond functional opacity on overlays.

**Density:**

- Minimal whitespace. Dense, information-rich layouts. The operator should see as much state as possible without scrolling.
- Padding: `8px` standard, `4px` compact, `12px` spacious (used rarely).
- Grid gap: `1px` to `4px` between tightly related items; `8px` between sections.

**Industrial UI Patterns:**

- **Progress bars**: Solid filled blocks. No animated shimmer, no stripes. A rectangle that fills left-to-right with `--accent` (running) or `--success` (complete).
- **Status LEDs**: Small dot indicators (`6px` circles) using status colors. The only permitted circular element.
  - Gray (`--text-secondary`): pending/idle
  - Orange (`--accent`) with CSS pulse animation: running/active
  - Green (`--success`): done/passed
  - Red (`--error`): failed/blocked
  - Dim green (`--success` at 50% opacity): merged
  - Amber (`--warning`): stale/degraded
- **Monospace tables**: All data tables use `Geist Mono`. Fixed-width columns where possible. Rows separated by `--border` lines, not alternating row colors.
- **Buttons**: Flat rectangles. Default: `--bg-surface` background, `--text-primary` text, `1px solid var(--border)`. Primary/destructive actions: `--accent` or `--error` background, `#0A0A0A` text.
- **Inputs**: `--bg-primary` background, `1px solid var(--border)`, `--text-primary` text. Focus state: border changes to `--accent`.

---

## 2. Views

### 2.1 Dashboard / Run View (Main View)

The primary operational view. Single workspace focus — one active run at a time.

#### 2.1.1 Top Bar

A persistent horizontal bar at the top of the viewport. Always visible. Contains:

| Element             | Position   | Content                                                                |
|---------------------|------------|------------------------------------------------------------------------|
| Run status LED      | Left       | Status LED dot + label (e.g., `● RUNNING`, `● COMPLETE`, `● FAILED`). |
| Repo URL            | Left       | Repository identifier. Monospace. Truncated with ellipsis if long.     |
| Model name          | Center-left| Active LLM model identifier (e.g., `claude-sonnet-4-20250514`).       |
| Elapsed time        | Center     | `HH:MM:SS` since run start. Live-updating.                            |
| Task progress       | Center-right| `X/Y complete` — count of finished tasks over total tasks.            |
| **Pause All**       | Right      | Emergency button. `--accent` background, bold label: `⏸ PAUSE ALL`.   |

The **Pause All** button is the single most prominent interactive element in the top bar. It is always visible, always accessible, always Forge orange. Clicking it sends a pause signal to the orchestrator, halting all running agents. A confirmation is not required — the operator's intent is assumed to be urgent.

When paused, the button transforms to `▶ RESUME` with the same prominence.

#### 2.1.2 DAG Visualization

A directed acyclic graph rendering of the task dependency structure. Positioned prominently — either as a wide panel below the top bar or as a left sidebar, depending on viewport width.

Node representation:

| Task Status | Node Color       | Node Style                                    |
|-------------|------------------|-----------------------------------------------|
| `pending`   | `--text-secondary` (gray) | Solid fill, dimmed.                  |
| `running`   | `--accent` (orange)       | Solid fill + CSS pulse animation.    |
| `done`      | `--success` (green)       | Solid fill.                          |
| `failed`    | `--error` (red)           | Solid fill.                          |
| `merged`    | `--success` at 50% opacity | Dimmed green. Indicates merged into main. |
| `stale`     | `--warning` (amber)       | Solid fill.                          |

Edges: `1px` lines in `--border` color. Edges leading to the currently selected task highlight in `--accent`.

Nodes are clickable — clicking navigates to the Task Detail View (§2.3).

The DAG updates in real-time as task statuses change. New nodes appear when tasks are created dynamically (e.g., by the refinery).

#### 2.1.3 Task List

A sortable, filterable monospace table below or beside the DAG. Columns:

| Column   | Content                              | Sortable | Filterable |
|----------|--------------------------------------|----------|------------|
| Status   | Status LED dot                       | Yes      | Yes (dropdown) |
| ID       | Task ID (truncated hash or slug)     | Yes      | No         |
| Title    | Task title text                      | Yes      | Yes (search) |
| Type     | `code`, `test`, `config`, etc.       | Yes      | Yes (dropdown) |
| Agent    | Assigned agent ID or `—` if unassigned | Yes    | Yes (dropdown) |
| Branch   | Git branch name                      | No       | No         |
| Deps     | Count of unfinished dependencies     | Yes      | No         |

Clicking a row navigates to the Task Detail View (§2.3).

Filter controls: A compact row of dropdowns and a search input above the table. Filters apply immediately (no "apply" button). Active filters show as `--accent`-colored pills that can be dismissed.

#### 2.1.4 Active Agents Panel

A panel showing currently running agents with real-time output streaming. Each agent gets a compact card:

```
┌─────────────────────────────────────────────────┐
│ ● agent-07  ─  task: implement-auth  ─  02:14  │
│ > Reading src/auth/middleware.ts...             │
│ > Creating JWT validation function...           │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────────┘
```

- Status LED (running = orange pulse).
- Agent ID, currently assigned task, elapsed time on task.
- Last 2–3 lines of agent output, streaming in real-time.
- Clicking the card navigates to the Task Detail View (§2.3) for the agent's current task.

If more agents are active than can fit in the panel, the panel scrolls vertically. Agents are ordered by most recently active.

#### 2.1.5 Recent Events Feed

A scrolling feed of raw NDJSON events, styled as a terminal log. Newest events at the bottom. Auto-scrolls to bottom unless the user has scrolled up (scroll lock).

Each event line shows:

```
[HH:MM:SS.mmm]  event.type  ─  summary
```

- Timestamp in `--text-secondary`.
- Event type in `--text-primary`.
- Summary text derived from event payload.
- Status-colored left border: green for completions, red for failures, orange for running, gray for info.

The feed is filterable by event type via a compact dropdown. Maximum rendered events: 500 (older events are evicted from the DOM but remain in memory for export).

---

### 2.2 Captain Interview View

The conversational interface for the Captain's planning phase.

#### 2.2.1 Layout

A vertically-scrolling chat pane. Full viewport width (or max `800px` centered on wide screens). Dark background (`--bg-primary`).

#### 2.2.2 Message Bubbles

- **User messages**: Right-aligned. `--bg-surface` background, `--text-primary` text, `1px solid var(--border)` border. Sharp corners.
- **Captain messages**: Left-aligned. `--bg-primary` background (no distinct surface — blends with page), `--text-primary` text, left border `2px solid var(--accent)`.
- Captain text streams in character-by-character as `task.progress` events arrive.

#### 2.2.3 Tool Usage Display

When the Captain invokes tools (`read`, `bash`, `web_search`, etc.), they appear inline in the Captain's message stream as collapsible panels:

```
▶ bash: find src/ -name "*.ts" | head -20
```

- Collapsed by default (shows tool name + truncated command/query).
- Expandable to show full arguments and results.
- Tool panels have a `--bg-surface` background and `1px solid var(--border)`.
- Tool result text in `--text-secondary` to de-emphasize.

#### 2.2.4 Artifact Creation Indicators

When the Captain creates an artifact (spec, task file, DAG, etc.), a distinct indicator appears in the message flow:

```
┌──────────────────────────────────────┐
│ 📄 Created: specs/architecture.md   │
└──────────────────────────────────────┘
```

- `--bg-surface` background, `--accent` left border.
- Clickable — opens the artifact in the Artifacts Browser (§2.5).

#### 2.2.5 Finalize Plan Indicator

When the Captain signals planning is complete, a prominent banner appears:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PLAN FINALIZED — Review artifacts below
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- Full-width, `--accent` text, `--bg-surface` background.

#### 2.2.6 Plan Review

After the Captain finishes, all created artifacts are listed for user review:

- A vertical list of artifact cards (filename, type, brief summary).
- Each card is expandable to show full content (rendered markdown).
- A single **"Approve & Execute"** button at the bottom — `--accent` background, prominent.
- Optionally, an **"Edit Plan"** button (secondary style) to re-enter the interview.

#### 2.2.7 Input Area

- Fixed to the bottom of the chat pane.
- Full-width text input. `--bg-surface` background, `--text-primary` text, `1px solid var(--border)`.
- Send button: `--accent` background, `→` icon.
- Disabled (grayed out) when Captain is actively generating a response.

---

### 2.3 Task Detail View

Detailed view for a single task. Navigated to from the DAG, task list, or active agents panel.

#### 2.3.1 Task Metadata Header

A compact header bar showing:

| Field         | Content                                    |
|---------------|--------------------------------------------|
| Status LED    | Current status with label                  |
| Task ID       | Full task identifier                       |
| Title         | Task title (Geist-Pixel, larger)           |
| Type          | Task type (`code`, `test`, `config`, etc.) |
| Dependencies  | List of dependency task IDs (clickable)    |
| Branch        | Git branch name (copyable)                 |
| Agent         | Assigned agent ID                          |

#### 2.3.2 Agent Output Stream

The primary content area. Real-time streaming of the agent's work output.

- Text streams character-by-character via `task.progress` events.
- Rendered in `Geist Mono`, `--text-primary` on `--bg-primary`.
- Thinking/reasoning blocks (if surfaced by the model) rendered in `--text-secondary` with a `--border` left border.
- Auto-scrolls to bottom. Scroll lock on user scroll-up.
- Virtual scrolling for long outputs (keep DOM node count bounded).

#### 2.3.3 Tool Call History

A collapsible sidebar or section listing all tool calls made by the agent, in chronological order.

Each tool call entry:

```
▶ [HH:MM:SS] edit_file — src/auth/jwt.ts
```

- Collapsed by default.
- Expandable to show:
  - Full tool call arguments (syntax-highlighted JSON or formatted display).
  - Tool result / return value.
  - Duration of the tool call.
- Tool calls with errors: `--error` left border.

#### 2.3.4 Walkthrough

Displayed after the agent completes the task. The walkthrough is parsed from the agent's output artifact (YAML frontmatter + markdown body). See [08-artifact-schemas.md](./08-artifact-schemas.md) for the walkthrough schema.

- Rendered as styled markdown within a `--bg-surface` panel.
- YAML frontmatter fields (title, summary, files_changed, risks, followups) displayed as a structured header.
- Markdown body rendered below with syntax highlighting for code blocks.

#### 2.3.5 Files Changed

A list of files modified by the agent during this task:

| Column   | Content                          |
|----------|----------------------------------|
| File     | File path (monospace, clickable) |
| Action   | `created`, `modified`, `deleted` |
| Reason   | Brief description from walkthrough |

#### 2.3.6 Test Results

If the task includes test execution:

- Summary line: `✓ 14 passed  ✗ 2 failed  ○ 1 skipped`
  - Counts colored with `--success`, `--error`, `--text-secondary` respectively.
- Expandable list of individual test cases with pass/fail status.
- Failed test output shown inline (stderr, assertion messages).

#### 2.3.7 Risks and Followups

Extracted from the walkthrough artifact's YAML frontmatter:

- **Risks**: Displayed as a list with `--warning` left border. Each risk is a short text description.
- **Followups**: Displayed as a list with `--text-secondary` left border. Each followup is a suggested future action.

---

### 2.4 Refinery View

A dedicated view for monitoring the refinery's merge and integration process.

#### 2.4.1 Merge Progress

A table or timeline showing which branches are being merged:

| Column        | Content                                 |
|---------------|-----------------------------------------|
| Source branch  | Branch being merged                    |
| Target         | Target branch (typically `main`)       |
| Status LED     | Merging / Merged / Conflict / Failed   |
| Merge strategy | `fast-forward`, `three-way`, etc.      |

Branches currently being merged show the orange pulse animation.

#### 2.4.2 Conflict Indicators

When merge conflicts occur:

- A prominent `--error`-bordered panel listing conflicting files.
- Each file shows:
  - File path.
  - Conflict resolution status: `unresolved`, `auto-resolved`, `agent-resolved`, `manual`.
  - If resolved, which agent or method resolved it.
- Unresolved conflicts are visually urgent (`--error` background tint).

#### 2.4.3 Test Results

Integration test output from the refinery's test runs:

- Same format as §2.3.6 (pass/fail summary + expandable details).
- Displayed per merge operation (each merge may trigger its own test suite).

#### 2.4.4 Change Request Emission

If the refinery determines that additional work is needed and emits a Change Request:

- A prominent `--warning`-bordered banner appears:
  ```
  ⚠ CHANGE REQUEST EMITTED — CR-0042: "Fix auth race condition"
  ```
- Clickable — navigates to the Change Request View (§2.6).

#### 2.4.5 Sub-Agent Spawning

When the refinery spawns sub-agents to resolve conflicts or fix integration issues:

- Each spawned agent appears as a compact card (same format as §2.1.4 Active Agents Panel).
- Linked to the refinery's current merge operation.

#### 2.4.6 Refinery Progress Reports

Refinery-specific status updates displayed as a timeline/log:

```
[12:04:01] Merging branch task/implement-auth into main
[12:04:03] Conflict detected: src/routes.ts
[12:04:05] Spawning agent refinery-01 to resolve conflict
[12:04:22] Conflict resolved by refinery-01
[12:04:23] Running integration tests...
[12:04:45] Tests passed (28/28)
[12:04:46] Merge complete
```

---

### 2.5 Artifacts Browser

A file-explorer-style view for browsing all artifacts produced during a run.

#### 2.5.1 File Tree

A left sidebar showing the artifact directory structure as a collapsible tree:

```
▼ specs/
    architecture.md
    data-model.md
▼ tasks/
    task-001-implement-auth.yaml
    task-002-add-tests.yaml
▼ walkthroughs/
    wt-001-implement-auth.md
▼ change-requests/
    cr-001-fix-race.md
  dag.json
```

- Directories are collapsible.
- Files show an icon or indicator for type (spec, task, walkthrough, CR, DAG).
- Clicking a file opens it in the content pane.

#### 2.5.2 Content Pane

The right/main area showing the selected artifact's content:

- **Markdown files** (specs, walkthroughs, CRs): Rendered as styled markdown. Headings in `Geist-Pixel`, body in `Geist Mono`. Code blocks syntax-highlighted.
- **YAML files** (tasks): Rendered as syntax-highlighted YAML with structured field display.
- **JSON files**: Syntax-highlighted JSON. If the file is `dag.json`, render as an interactive graph (same renderer as §2.1.2 DAG Visualization).

#### 2.5.3 DAG Visualization

When `dag.json` is selected, the content pane switches to an interactive graph view:

- Same rendering as the Dashboard DAG (§2.1.2) but larger and more detailed.
- Nodes show full task titles (not truncated).
- Edges labeled with dependency type if applicable.
- Pan and zoom controls.
- Clicking a node navigates to the Task Detail View (§2.3).

---

### 2.6 Change Request View

A dedicated view for managing Change Requests emitted by the refinery or other system components.

#### 2.6.1 CR List

A table listing all Change Requests:

| Column   | Content                                          |
|----------|--------------------------------------------------|
| Status   | LED: pending (gray), approved (green), rejected (red), applied (dim green) |
| CR ID    | Change Request identifier                        |
| Title    | CR title                                         |
| Source   | What emitted the CR (refinery, agent, user)      |
| Created  | Timestamp                                        |
| Impact   | Brief impact summary                             |

Sortable by any column. Filterable by status.

#### 2.6.2 CR Detail

Clicking a CR opens its full detail:

- **Header**: CR ID, title, status LED, source, timestamp.
- **Body**: Full Change Request markdown, rendered with the same markdown renderer as the Artifacts Browser.
- **Impact Assessment**: Structured display of affected tasks, files, and dependencies.
- **DAG Overlay Diff**: A visualization showing how applying this CR would modify the current DAG — added nodes in `--accent`, removed nodes in `--error`, modified edges dashed.

#### 2.6.3 Approve / Reject Controls

When the system is configured for user review of CRs (rather than auto-apply):

- Two buttons below the CR detail:
  - **Approve**: `--success` background. Approving triggers the orchestrator to apply the CR.
  - **Reject**: `--error` background. Rejecting dismisses the CR and logs the decision.
- Optional text input for rejection reason.
- Once acted upon, buttons are replaced with the decision record (who, when, reason).

---

## 3. Real-Time Streaming

### 3.1 Connection

The web interface connects to the Forge API's streaming endpoint:

```
GET /runs/:runId/stream
Accept: application/x-ndjson
```

This returns a persistent HTTP response with newline-delimited JSON events. See [09-sdk-api.md](./09-sdk-api.md) for the full event schema.

### 3.2 Event Routing

Each incoming NDJSON event is parsed and routed to the appropriate UI component:

| Event Type        | Routed To                                    |
|-------------------|----------------------------------------------|
| `run.status`      | Top bar status, DAG (global state)           |
| `task.status`     | DAG nodes, Task List, Task Detail header     |
| `task.progress`   | Active Agents Panel, Task Detail output stream |
| `task.tool_call`  | Task Detail tool call history                |
| `task.tool_result`| Task Detail tool call history                |
| `task.complete`   | DAG nodes, Task List, walkthrough rendering  |
| `refinery.*`      | Refinery View                                |
| `cr.created`      | Change Request View, Refinery View           |
| `cr.status`       | Change Request View                          |
| `captain.*`       | Captain Interview View                       |

### 3.3 Rendering Behavior

- **Agent output** (`task.progress`): Streams character-by-character into the output area. Buffered at the UI layer for smooth rendering (requestAnimationFrame batching, not raw DOM updates per character).
- **Tool calls** (`task.tool_call`): Appear as a new collapsible block in the output stream. The block initially shows as "in progress" (orange border) until the corresponding `task.tool_result` arrives, at which point it collapses and shows the result.
- **Status transitions**: When a task or run status changes, the corresponding LED and DAG node update immediately. A brief CSS pulse animation (150ms) draws the operator's eye to the change.

### 3.4 Reconnection

If the streaming connection drops:

1. The UI shows a `--warning`-colored banner: `Connection lost. Reconnecting...`
2. Reconnect attempts use exponential backoff: 1s, 2s, 4s, 8s, max 30s.
3. On reconnect, the client appends `?after=<lastEventId>` to the stream URL to replay missed events.
4. During replay, events are processed in order but without character-by-character animation (applied as bulk updates).
5. Once caught up, the banner dismisses and live streaming resumes.

---

## 4. Future Consideration (NOT for MVP)

### 4.1 Multi-Pane View (tmux-style)

A split-screen layout allowing the operator to view multiple agent outputs simultaneously, similar to tmux panes:

- Horizontal and vertical splits.
- Each pane shows one agent's real-time output.
- Panes can be resized, swapped, and closed.
- Keyboard shortcuts for pane navigation (Ctrl+B style).

**This is explicitly deferred to post-MVP.** The MVP focuses on single-focus views with navigation between them. The multi-pane view adds significant complexity in layout management, event routing, and rendering performance that is not justified until the core interface is stable.

---

## 5. Technical Implementation Notes

### 5.1 Framework

Frontend technology is **to be determined**. The architecture should remain framework-agnostic where possible. Candidates include React, Svelte, SolidJS, or vanilla TypeScript. Selection criteria:

- Efficient DOM updates for high-frequency streaming data.
- Lightweight bundle size (the UI should load fast).
- Good support for reactive state management.
- Ecosystem maturity for DAG/graph visualization libraries.

### 5.2 Streaming Performance

The UI must handle dozens of agents streaming output simultaneously without degradation:

- **Virtual scrolling**: Long output streams (thousands of lines) must use virtual scrolling to keep DOM node count bounded. Only visible lines (plus a small overscan buffer) are rendered.
- **requestAnimationFrame batching**: All DOM updates from streaming events are batched into animation frames. No synchronous DOM manipulation per event.
- **Web Workers**: Event parsing and routing may be offloaded to a Web Worker to keep the main thread free for rendering.
- **Memory management**: Evict old events from in-memory buffers when they exceed a configurable threshold (e.g., 10,000 events per agent). Evicted events are still available via the API for on-demand loading.

### 5.3 Font Loading

```css
@font-face {
  font-family: "Geist-Pixel";
  src: url("https://cdn.vercel.com/geist/font/geist-pixel/...") format("woff2");
  font-display: swap;
}

@font-face {
  font-family: "Geist Mono";
  src: url("https://cdn.vercel.com/geist/font/geist-mono/...") format("woff2");
  font-display: swap;
}
```

- `font-display: swap` ensures text is visible immediately with fallback fonts, swapping to Geist once loaded.
- Fonts may also be bundled locally in the Forge distribution to avoid CDN dependency in air-gapped environments.

### 5.4 Accessibility

Even with a brutalist design, basic accessibility must be maintained:

- All interactive elements are keyboard-navigable.
- Status LEDs have text labels (not color-only).
- ARIA roles on dynamic regions (`aria-live` for streaming output, `role="status"` for status indicators).
- Sufficient contrast ratios: `--text-primary` (#E0E0E0) on `--bg-primary` (#0A0A0A) = 15.4:1 (exceeds WCAG AAA).
- Focus indicators: `2px solid var(--accent)` outline on focused elements.
