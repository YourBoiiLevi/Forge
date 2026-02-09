import type { SandboxCommandResult } from './manager';
import { SandboxManager } from './manager';

export type GitRemoteName = 'origin' | string;

export type GitRetryOptions = {
  /** Maximum attempts for remote operations (clone/fetch/push). Default: 5. */
  maxAttempts?: number;
  /** Base delay (ms) for attempt #2. Default: 1000. */
  baseDelayMs?: number;
  /** Jitter fraction applied to delay (e.g. 0.2 => ±20%). Default: 0.2. */
  jitterFraction?: number;

  /** Dependency injection for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type SandboxGitOptions = {
  manager: SandboxManager;
  sandboxId: string;
  /** Path inside the sandbox where the repo is cloned. Default: /home/user/repo */
  repoDir?: string;
  /** Remote name. Default: origin */
  remote?: GitRemoteName;
  /** Retry/backoff behavior for remote operations. */
  retry?: GitRetryOptions;
};

export type GitCommandContext = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export class GitCommandError extends Error {
  readonly context: GitCommandContext;

  constructor(message: string, context: GitCommandContext) {
    super(message);
    this.name = 'GitCommandError';
    this.context = context;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isSafeGitRefSegment(value: string): boolean {
  // Keep this intentionally strict to avoid injection when building shell commands.
  // Allow: alnum, dot, underscore, dash.
  return /^[A-Za-z0-9._-]+$/.test(value);
}

export function forgeBranchName(taskId: string, attemptId: number | string): string {
  const t = taskId.trim();
  const a = String(attemptId).trim();

  if (!t) throw new Error('taskId must not be empty');
  if (!a) throw new Error('attemptId must not be empty');
  if (!isSafeGitRefSegment(t)) throw new Error(`Invalid taskId for branch name: ${taskId}`);
  if (!/^[0-9]+$/.test(a)) throw new Error(`Invalid attemptId for branch name: ${attemptId}`);

  return `forge/${t}/${a}`;
}

function assertPosixAbsolutePath(p: string): string {
  const trimmed = p.trim();
  if (!trimmed.startsWith('/')) {
    throw new Error(`repoDir must be an absolute posix path: ${p}`);
  }
  if (trimmed.includes('\\') || trimmed.includes('\u0000')) {
    throw new Error(`repoDir contains invalid characters: ${p}`);
  }
  return trimmed;
}

function shQuote(arg: string): string {
  // POSIX-safe single-quote escaping: ' -> '\''
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}

function bashLc(script: string): string {
  return `bash -lc ${shQuote(script)}`;
}

async function runChecked(
  mgr: SandboxManager,
  sandboxId: string,
  command: string,
  opts?: { envs?: Record<string, string> },
): Promise<SandboxCommandResult> {
  const res = await mgr.runCommand(sandboxId, command, opts);
  if (res.exitCode !== 0) {
    throw new GitCommandError(`Command failed (exit ${res.exitCode})`, {
      command,
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.exitCode,
    });
  }
  return res;
}

async function runWithBackoff<T>(
  fn: () => Promise<T>,
  options: Required<Pick<GitRetryOptions, 'maxAttempts' | 'baseDelayMs' | 'jitterFraction' | 'sleep' | 'random'>>,
): Promise<T> {
  const { maxAttempts, baseDelayMs, jitterFraction, sleep, random } = options;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const exp = attempt - 2;
      const base = baseDelayMs * 2 ** exp;
      const jitterMax = Math.floor(base * jitterFraction);
      const jitter = jitterMax === 0 ? 0 : Math.floor((random() * 2 - 1) * jitterMax);
      const delay = Math.max(0, base + jitter);
      await sleep(delay);
    }

    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr;
}

export class SandboxGit {
  private readonly mgr: SandboxManager;
  private readonly sandboxId: string;
  private readonly repoDir: string;
  private readonly remote: GitRemoteName;
  private readonly retry: Required<Pick<GitRetryOptions, 'maxAttempts' | 'baseDelayMs' | 'jitterFraction' | 'sleep' | 'random'>>;

  constructor(options: SandboxGitOptions) {
    this.mgr = options.manager;
    this.sandboxId = options.sandboxId;
    this.repoDir = assertPosixAbsolutePath(options.repoDir ?? '/home/user/repo');
    this.remote = (options.remote ?? 'origin').trim() || 'origin';

    const maxAttempts = clampInt(options.retry?.maxAttempts ?? 5, 1, 20);
    const baseDelayMs = clampInt(options.retry?.baseDelayMs ?? 1000, 0, 60_000);
    const jitterFraction = Math.max(0, Math.min(1, options.retry?.jitterFraction ?? 0.2));
    const sleep = options.retry?.sleep ?? defaultSleep;
    const random = options.retry?.random ?? Math.random;

    this.retry = { maxAttempts, baseDelayMs, jitterFraction, sleep, random };
  }

  getRepoDir(): string {
    return this.repoDir;
  }

  /** Remote git operation. */
  async clone(repoUrl: string, opts?: { envs?: Record<string, string> }): Promise<void> {
    const url = repoUrl.trim();
    if (!url) throw new Error('repoUrl must not be empty');

    const cmd = bashLc(`git clone ${shQuote(url)} ${shQuote(this.repoDir)}`);
    await runWithBackoff(() => runChecked(this.mgr, this.sandboxId, cmd, opts), this.retry);
  }

  /** Local operation. */
  async checkoutBranch(branch: string): Promise<void> {
    const b = branch.trim();
    if (!b) throw new Error('branch must not be empty');
    const cmd = bashLc(`cd ${shQuote(this.repoDir)} && git checkout -B ${shQuote(b)}`);
    await runChecked(this.mgr, this.sandboxId, cmd);
  }

  /** Convenience for the standard Forge branch name. */
  async checkoutTaskBranch(taskId: string, attemptId: number | string): Promise<string> {
    const branch = forgeBranchName(taskId, attemptId);
    await this.checkoutBranch(branch);
    return branch;
  }

  /** Remote git operation. */
  async fetch(branch: string, opts?: { envs?: Record<string, string> }): Promise<void> {
    const b = branch.trim();
    if (!b) throw new Error('branch must not be empty');
    const cmd = bashLc(`cd ${shQuote(this.repoDir)} && git fetch ${shQuote(this.remote)} ${shQuote(b)}`);
    await runWithBackoff(() => runChecked(this.mgr, this.sandboxId, cmd, opts), this.retry);
  }

  /** Local operation. Expects the branch to have been fetched already. */
  async mergeRemoteBranch(branch: string): Promise<void> {
    const b = branch.trim();
    if (!b) throw new Error('branch must not be empty');
    const cmd = bashLc(
      `cd ${shQuote(this.repoDir)} && git merge ${shQuote(`${this.remote}/${b}`)} --no-edit`,
    );
    await runChecked(this.mgr, this.sandboxId, cmd);
  }

  /** Remote operation (fetch + merge) for a set of dependency branches. */
  async mergeDependencyBranches(
    deps: Array<{ taskId: string; attemptId: number | string }>,
    opts?: { envs?: Record<string, string> },
  ): Promise<string[]> {
    const branches = deps.map((d) => forgeBranchName(d.taskId, d.attemptId));
    for (const branch of branches) {
      await this.fetch(branch, opts);
      await this.mergeRemoteBranch(branch);
    }
    return branches;
  }

  /** Local operation. */
  async commitAll(params: {
    taskId: string;
    attemptId: number | string;
    agentId: string;
    summary: string;
  }): Promise<void> {
    const taskId = params.taskId.trim();
    const attemptId = String(params.attemptId).trim();
    const agentId = params.agentId.trim();
    const summary = params.summary.trim();

    if (!taskId) throw new Error('taskId must not be empty');
    if (!attemptId) throw new Error('attemptId must not be empty');
    if (!agentId) throw new Error('agentId must not be empty');
    if (!summary) throw new Error('summary must not be empty');

    if (!isSafeGitRefSegment(taskId)) throw new Error(`Invalid taskId for commit message: ${params.taskId}`);
    if (!/^[0-9]+$/.test(attemptId)) throw new Error(`Invalid attemptId for commit message: ${params.attemptId}`);

    const subject = `forge(${taskId}): ${summary}`;
    const cmd = bashLc(
      [
        `cd ${shQuote(this.repoDir)}`,
        `git add -A`,
        // Multiple -m create a correctly formatted multi-line message.
        `git commit -m ${shQuote(subject)} -m ${shQuote('')} -m ${shQuote(`Attempt: ${attemptId}`)} -m ${shQuote(
          `Task: ${taskId}`,
        )} -m ${shQuote(`Agent: ${agentId}`)}`,
      ].join(' && '),
    );

    await runChecked(this.mgr, this.sandboxId, cmd);
  }

  /** Remote git operation. */
  async push(branch: string, opts?: { envs?: Record<string, string> }): Promise<void> {
    const b = branch.trim();
    if (!b) throw new Error('branch must not be empty');
    const cmd = bashLc(`cd ${shQuote(this.repoDir)} && git push ${shQuote(this.remote)} ${shQuote(b)}`);
    await runWithBackoff(() => runChecked(this.mgr, this.sandboxId, cmd, opts), this.retry);
  }
}
