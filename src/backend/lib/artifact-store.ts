import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type AtomicWriteHooks = {
  /**
   * Test/debug hook that runs after the temp file is fully written+fsynced,
   * but before the atomic rename to the destination.
   */
  beforeRename?: (ctx: { tmpPath: string; destPath: string }) => Promise<void>;
};

export async function atomicWriteFile(
  destPath: string,
  data: string | Uint8Array,
  options?: {
    encoding?: BufferEncoding;
    hooks?: AtomicWriteHooks;
  },
): Promise<void> {
  const dir = path.dirname(destPath);
  await fs.mkdir(dir, { recursive: true });

  // Place tmp file in the same directory so rename stays on the same volume.
  const tmpPath = `${destPath}.${randomUUID()}.tmp`;
  const file = await fs.open(tmpPath, 'w');

  try {
    if (typeof data === 'string') {
      await file.writeFile(data, { encoding: options?.encoding ?? 'utf8' });
    } else {
      await file.writeFile(data);
    }

    // Ensure data is flushed before rename.
    await file.sync();
  } catch (err) {
    // Best-effort cleanup; keep original error.
    try {
      await file.close();
    } catch {
      // ignore
    }
    try {
      await fs.rm(tmpPath, { force: true });
    } catch {
      // ignore
    }
    throw err;
  }

  await file.close();

  try {
    if (options?.hooks?.beforeRename) {
      await options.hooks.beforeRename({ tmpPath, destPath });
    }

    await fs.rename(tmpPath, destPath);
  } catch (err) {
    // Avoid leaving temp files around.
    try {
      await fs.rm(tmpPath, { force: true });
    } catch {
      // ignore
    }
    throw err;
  }
}

function assertPathSegment(label: string, value: string): void {
  if (!value || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new Error(`${label} must not contain path separators`);
  }
  if (value === '.' || value === '..') {
    throw new Error(`${label} must not be '.' or '..'`);
  }
}

function assertSafeRelativePosixPath(label: string, relPath: string): void {
  if (!relPath || relPath.trim() !== relPath) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  if (relPath.startsWith('/')) {
    throw new Error(`${label} must be a relative path`);
  }

  // Treat as URL/posix style paths.
  const parts = relPath.split('/');
  for (const part of parts) {
    if (!part) {
      throw new Error(`${label} must not contain empty path segments`);
    }
    if (part === '.' || part === '..') {
      throw new Error(`${label} must not contain '.' or '..' segments`);
    }
    if (part.includes('\\')) {
      throw new Error(`${label} must not contain \\`);
    }
  }
}

export type ArtifactStoreOptions = {
  /** Absolute or relative base directory that will contain `artifacts/<runId>/...`. */
  baseDir: string;
};

/**
 * Central artifact persistence for a Forge run.
 *
 * Layout and schemas are defined in specs/08-artifact-schemas.md.
 */
export class ArtifactStore {
  readonly baseDir: string;

  constructor(options: ArtifactStoreOptions) {
    this.baseDir = path.resolve(options.baseDir);
  }

  static fromEnv(): ArtifactStore {
    // When running from `src/backend`, default to repo-root `artifacts/`.
    const defaultBase = path.resolve(process.cwd(), '..', '..', 'artifacts');
    const baseDir = process.env.FORGE_ARTIFACTS_DIR?.trim() || defaultBase;
    return new ArtifactStore({ baseDir });
  }

  runDir(runId: string): string {
    assertPathSegment('runId', runId);
    return path.join(this.baseDir, runId);
  }

  specsDir(runId: string): string {
    return path.join(this.runDir(runId), 'specs');
  }

  tasksDir(runId: string): string {
    return path.join(this.runDir(runId), 'tasks');
  }

  changeRequestsDir(runId: string): string {
    return path.join(this.runDir(runId), 'change-requests');
  }

  dagJsonPath(runId: string): string {
    return path.join(this.runDir(runId), 'dag.json');
  }

  dagStatusJsonPath(runId: string): string {
    return path.join(this.runDir(runId), 'dag-status.json');
  }

  runStateJsonPath(runId: string): string {
    return path.join(this.runDir(runId), 'run-state.json');
  }

  taskDir(runId: string, taskId: string): string {
    assertPathSegment('taskId', taskId);
    return path.join(this.runDir(runId), taskId);
  }

  attemptDir(runId: string, taskId: string, attemptId: string): string {
    assertPathSegment('attemptId', attemptId);
    return path.join(this.taskDir(runId, taskId), attemptId);
  }

  walkthroughPath(runId: string, taskId: string, attemptId: string): string {
    return path.join(this.attemptDir(runId, taskId, attemptId), 'walkthrough.md');
  }

  changeRequestDir(runId: string, crId: string): string {
    assertPathSegment('crId', crId);
    return path.join(this.changeRequestsDir(runId), crId);
  }

  changeRequestMarkdownPath(runId: string, crId: string): string {
    return path.join(this.changeRequestDir(runId, crId), 'change-request.md');
  }

  dagOverlayPath(runId: string, crId: string): string {
    return path.join(this.changeRequestDir(runId, crId), 'dag-overlay.json');
  }

  /** Ensures `artifacts/<runId>/` base structure exists. */
  async ensureRunInitialized(runId: string): Promise<void> {
    const runDir = this.runDir(runId);
    await fs.mkdir(runDir, { recursive: true });

    // Canonical subdirectories per spec 08.
    await Promise.all([
      fs.mkdir(this.specsDir(runId), { recursive: true }),
      fs.mkdir(this.tasksDir(runId), { recursive: true }),
      fs.mkdir(this.changeRequestsDir(runId), { recursive: true }),
    ]);
  }

  async ensureAttemptInitialized(runId: string, taskId: string, attemptId: string): Promise<void> {
    await this.ensureRunInitialized(runId);
    await fs.mkdir(this.attemptDir(runId, taskId, attemptId), { recursive: true });
  }

  /**
   * Resolve a run-scoped relative artifact path (posix style) to an absolute on-disk path.
   * Rejects traversal / absolute paths.
   */
  resolveRunArtifactPath(runId: string, relPosixPath: string): string {
    assertSafeRelativePosixPath('artifact path', relPosixPath);
    const runRoot = this.runDir(runId);
    const resolved = path.resolve(runRoot, ...relPosixPath.split('/'));

    const rel = path.relative(runRoot, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('artifact path escapes run directory');
    }

    return resolved;
  }

  async writeText(runId: string, relPosixPath: string, content: string): Promise<void> {
    await this.ensureRunInitialized(runId);
    const dest = this.resolveRunArtifactPath(runId, relPosixPath);
    await atomicWriteFile(dest, content, { encoding: 'utf8' });
  }

  async readText(runId: string, relPosixPath: string): Promise<string> {
    const filePath = this.resolveRunArtifactPath(runId, relPosixPath);
    return fs.readFile(filePath, 'utf8');
  }

  async writeJson(runId: string, relPosixPath: string, value: unknown): Promise<void> {
    const json = `${JSON.stringify(value, null, 2)}\n`;
    await this.writeText(runId, relPosixPath, json);
  }

  async readJson<T>(runId: string, relPosixPath: string): Promise<T> {
    const raw = await this.readText(runId, relPosixPath);
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      throw new Error(`Failed to parse JSON at ${relPosixPath}`, { cause: err as Error });
    }
  }

  async exists(runId: string, relPosixPath: string): Promise<boolean> {
    const filePath = this.resolveRunArtifactPath(runId, relPosixPath);
    try {
      await fs.stat(filePath);
      return true;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') return false;
      throw err;
    }
  }

  // Convenience methods for common artifacts (spec 08)

  async writeRunState(runId: string, state: unknown): Promise<void> {
    await this.writeJson(runId, 'run-state.json', state);
  }

  async readRunState<T>(runId: string): Promise<T> {
    return this.readJson<T>(runId, 'run-state.json');
  }

  async writeDag(runId: string, dag: unknown): Promise<void> {
    await this.writeJson(runId, 'dag.json', dag);
  }

  async readDag<T>(runId: string): Promise<T> {
    return this.readJson<T>(runId, 'dag.json');
  }

  async writeDagStatus(runId: string, status: unknown): Promise<void> {
    await this.writeJson(runId, 'dag-status.json', status);
  }

  async readDagStatus<T>(runId: string): Promise<T> {
    return this.readJson<T>(runId, 'dag-status.json');
  }

  async writeWalkthrough(runId: string, taskId: string, attemptId: string, markdown: string): Promise<void> {
    await this.ensureAttemptInitialized(runId, taskId, attemptId);
    const dest = this.walkthroughPath(runId, taskId, attemptId);
    await atomicWriteFile(dest, markdown, { encoding: 'utf8' });
  }

  async readWalkthrough(runId: string, taskId: string, attemptId: string): Promise<string> {
    return fs.readFile(this.walkthroughPath(runId, taskId, attemptId), 'utf8');
  }
}
