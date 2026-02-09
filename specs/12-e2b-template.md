# Spec 12 — E2B Custom Template Definition

> Status: **Draft**
> Last updated: 2026-02-09

---

## 1. Overview

Every worker agent in Forge runs inside an [E2B](https://e2b.dev) sandbox created from a **custom template**. The template is built from a Dockerfile (`e2b.Dockerfile`) using the E2B CLI. It is pre-installed with every tool an autonomous software-engineering agent needs — runtimes, package managers, version control, browsers, linters, formatters, search utilities, and specialised agent tooling — so that sandbox boot time stays minimal and agents can begin work immediately.

The template acts as a **golden image**: one build produces a snapshot that is reused across all sandboxes within a run. Template changes are versioned and tracked alongside Forge's own configuration.

---

## 2. Template Build Process

| Step | Detail |
|------|--------|
| **1. Author Dockerfile** | Create / edit `e2b.Dockerfile` in the repo root (extends `e2bdev/code-interpreter:latest`). |
| **2. Build template** | Run `e2b template build`. The CLI sends the Dockerfile to E2B, which builds the image, extracts the filesystem, and snapshots the sandbox. |
| **3. Record template ID** | The resulting template ID (e.g. `forge-worker-v1`) is stored in `e2b.toml` and referenced by Forge configuration when spawning sandboxes. |
| **4. Spawn sandboxes** | The executor calls `Sandbox.create(template: "<id>")` — E2B boots a sandbox from the snapshot in ~150 ms. |

### Rebuild triggers

- Any change to `e2b.Dockerfile`.
- Explicit manual rebuild (`e2b template build`).
- CI pipeline step (recommended: rebuild on merge to `main` when Dockerfile changes).

---

## 3. Pre-installed Software

### 3.1 Runtime & Package Managers

| Software | Version | Notes |
|----------|---------|-------|
| Node.js | LTS (v22.x or latest LTS at build time) | Installed via NodeSource |
| npm | Bundled with Node.js | — |
| pnpm | Latest | Installed globally via npm |
| yarn | Latest (Classic v1) | Installed globally via npm |
| Python 3.x | Included in base image | `e2bdev/code-interpreter` ships Python |
| pip | Included in base image | — |

### 3.2 Version Control

| Software | Notes |
|----------|-------|
| Git (latest) | Pre-configured with `Forge Agent` identity (see §4) |
| GitHub CLI (`gh`) | For authenticated PR creation, issue queries, etc. |

Git global config applied at build time:

```
user.name  = "Forge Agent"
user.email = "forge-agent@forge.local"
init.defaultBranch = main
```

### 3.3 Browsers & Testing

| Software | Purpose |
|----------|---------|
| Chromium | Headless browser testing, screenshot capture |
| Firefox ESR | Cross-browser verification |

### 3.4 Development Tools

| Tool | Purpose |
|------|---------|
| TypeScript (`tsc`) | Type-checking |
| ESLint | Linting |
| Prettier | Code formatting |
| jq | JSON processing on the command line |
| curl, wget | HTTP requests |
| ripgrep (`rg`) | Fast recursive text search |
| fd-find (`fd`) | Fast file finding |

### 3.5 Vercel Labs Tools

| Tool | Purpose |
|------|---------|
| `dev3000` | Captures dev timelines — records the development process for walkthrough artifacts |
| `agent-browser` | Headless browsing with ~93% context reduction — purpose-built browser interface for agents |

### 3.6 Standard E2B Base-Image Includes

The `e2bdev/code-interpreter:latest` base image already provides:

- Python with common data-science packages (numpy, pandas, etc.)
- Jupyter kernel
- Basic Unix utilities (`ls`, `cat`, `grep`, `find`, `sed`, `awk`, `head`, `tail`, `wc`, etc.)

### 3.7 Editor / IDE

| Tool | Purpose |
|------|---------|
| code-server (VSCode Server) | Available for debugging / manual inspection of sandbox state |

---

## 4. e2b.Dockerfile

```dockerfile
FROM e2bdev/code-interpreter:latest

# ── System packages ──────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    jq \
    ripgrep \
    fd-find \
    chromium \
    firefox-esr \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js LTS ──────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm yarn typescript eslint prettier

# ── GitHub CLI ────────────────────────────────────────────────────────────────
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh

# ── Git configuration ────────────────────────────────────────────────────────
RUN git config --global user.name "Forge Agent" \
    && git config --global user.email "forge-agent@forge.local" \
    && git config --global init.defaultBranch main

# ── Vercel Labs tools ────────────────────────────────────────────────────────
RUN npm install -g dev3000 agent-browser

# ── VSCode Server (code-server) ──────────────────────────────────────────────
RUN curl -fsSL https://code-server.dev/install.sh | sh

# ── Working directory ────────────────────────────────────────────────────────
WORKDIR /workspace
```

> **Note:** This Dockerfile is a starting point. Actual package versions and availability should be verified during implementation. Some packages (e.g. Chromium, Firefox ESR) may require alternative installation methods depending on the base image's OS release.

---

## 5. Template Configuration — `e2b.toml`

```toml
# This file is auto-generated by the e2b CLI.
template_id    = "forge-worker-v1"
dockerfile     = "e2b.Dockerfile"
template_name  = "forge-worker"
```

The file is committed to the repository so that every developer and CI pipeline references the same template.

---

## 6. Sandbox Startup Sequence

When the executor creates a sandbox from this template, the following steps occur:

| # | Step | Detail |
|---|------|--------|
| 1 | **Boot** | Sandbox boots from the snapshot (~150 ms). |
| 2 | **Inject credentials** | `GITHUB_TOKEN` and other environment variables (§7) are injected. |
| 3 | **Clone repository** | The target repository is cloned into `/workspace`. |
| 4 | **Checkout branch** | The designated branch (`forge/<taskId>/<attemptId>`) is checked out or created. |
| 5 | **Merge dependencies** | If the task depends on other tasks, their branches are merged into the working branch. |
| 6 | **Agent execution** | The agent process starts and begins executing its instructions. |

See [06-sandbox-git.md](./06-sandbox-git.md) for the full sandbox lifecycle and git strategy.

---

## 7. Environment Variables Injected at Runtime

These variables are **not** baked into the template. They are passed to each sandbox instance at creation time.

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Authentication for `git push`, `git pull`, `git clone`, and `gh` CLI operations. |
| `FORGE_RUN_ID` | Identifier for the current Forge run. |
| `FORGE_TASK_ID` | Identifier for the task this sandbox is executing. |
| `FORGE_ATTEMPT_ID` | Identifier for the current attempt of the task. |
| `FORGE_BRANCH` | Branch name to work on — follows the pattern `forge/<taskId>/<attemptId>`. |
| `FORGE_ARTIFACT_ENDPOINT` | URL of the artifact store API (used for uploading walkthroughs, logs, etc.). |
| `NODE_ENV` | Set to `development`. |

---

## 8. Resource Constraints

| Resource | Default | Notes |
|----------|---------|-------|
| **vCPUs** | 2 | Configurable via the E2B dashboard or API. |
| **RAM** | 512 MB | Configurable via the E2B dashboard or API. |
| **Disk** | E2B default (adequate for typical repos) | Sufficient for `node_modules`, build artifacts, cloned repos. |
| **Network** | Full internet access | Required for `npm install`, `git clone`, API calls, etc. |
| **Timeout** | Managed by executor (default 1 hour) | Executor supports pause/resume; E2B hard limit is configurable. |

If a task requires heavier resources (e.g. large monorepo builds), the executor may request a higher-tier sandbox configuration via the E2B API at creation time.

---

## 9. Template Versioning

| Concern | Strategy |
|---------|----------|
| **Version tracking** | Template ID and build hash stored in Forge configuration (`e2b.toml` + run metadata). |
| **Rebuild & deploy** | Template is rebuilt when `e2b.Dockerfile` changes (manual or CI-triggered). |
| **Consistency within a run** | All sandboxes spawned during a single run use the same template version. |
| **Reproducibility** | The template ID is recorded in run configuration so any run can be replayed against the exact same environment. |
| **Rollback** | Previous template IDs are retained; reverting is a config change pointing back to an older ID. |

---

## Cross-references

- [06-sandbox-git.md](./06-sandbox-git.md) — Sandbox lifecycle, git branching strategy, and credential injection.
- [04-agent-types.md](./04-agent-types.md) — Which agent types use this template and how they are dispatched.
