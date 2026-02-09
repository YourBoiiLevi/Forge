import { Sandbox as E2BSandbox } from '@e2b/code-interpreter';

export type SandboxMetadata = Record<string, string>;

export type SandboxState = 'running' | 'paused';

export type SandboxRecord = {
  sandboxId: string;
  templateId: string;
  metadata: SandboxMetadata;
  startedAt: Date;
  endAt: Date;
  state: SandboxState;
};

export type SandboxCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type SandboxInfoLike = {
  sandboxId: string;
  templateId: string;
  metadata: SandboxMetadata;
  startedAt: string | Date;
  endAt: string | Date;
  name?: string;
};

export type SandboxInstance = {
  sandboxId: string;
  commands: {
    run: (command: string, opts?: { envs?: Record<string, string> }) => Promise<SandboxCommandResult>;
  };
  files: {
    read: (filePath: string) => Promise<string>;
    write: (filePath: string, content: string | Uint8Array) => Promise<void>;
  };
  getInfo: (opts?: unknown) => Promise<SandboxInfoLike>;
  setTimeout: (timeoutMs: number, opts?: unknown) => Promise<void>;
  betaPause: (opts?: unknown) => Promise<boolean>;
  kill: (opts?: unknown) => Promise<void>;
};

export type SandboxStatic = {
  create: {
    (opts?: { timeoutMs?: number; autoPause?: boolean; metadata?: SandboxMetadata; envs?: Record<string, string> }):
      Promise<SandboxInstance>;
    (
      templateId: string,
      opts?: { timeoutMs?: number; autoPause?: boolean; metadata?: SandboxMetadata; envs?: Record<string, string> },
    ): Promise<SandboxInstance>;
  };
  connect: (sandboxId: string, opts?: unknown) => Promise<SandboxInstance>;
};

export type SandboxManagerOptions = {
  /** Default template ID used when creating sandboxes (optional; uses E2B default if omitted). */
  templateId?: string;
  /** Default sandbox timeout (ms). Defaults to 1 hour (base tier max). */
  defaultTimeoutMs?: number;
  /** Default autoPause behavior for new sandboxes. */
  defaultAutoPause?: boolean;
  /** Global environment variables set at sandbox creation time. */
  defaultEnvs?: Record<string, string>;

  /** Dependency injection for tests. */
  Sandbox?: SandboxStatic;
};

export type CreateSandboxParams = {
  templateId?: string;
  timeoutMs?: number;
  autoPause?: boolean;
  metadata?: SandboxMetadata;
  envs?: Record<string, string>;
};

function asDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return d;
}

function mergeEnvs(a?: Record<string, string>, b?: Record<string, string>): Record<string, string> | undefined {
  if (!a && !b) return undefined;
  return { ...(a ?? {}), ...(b ?? {}) };
}

type SandboxEntry = {
  sandbox: SandboxInstance;
  record: SandboxRecord;
};

/**
 * Manages the lifecycle of E2B sandboxes.
 *
 * Spec: specs/06-sandbox-git.md
 */
export class SandboxManager {
  private readonly Sandbox: SandboxStatic;
  private readonly defaultTemplateId?: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultAutoPause: boolean;
  private readonly defaultEnvs?: Record<string, string>;

  private readonly entries = new Map<string, SandboxEntry>();

  constructor(options: SandboxManagerOptions = {}) {
    this.Sandbox = options.Sandbox ?? (E2BSandbox as unknown as SandboxStatic);
    this.defaultTemplateId = options.templateId;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60 * 60 * 1000;
    this.defaultAutoPause = options.defaultAutoPause ?? false;
    this.defaultEnvs = options.defaultEnvs;
  }

  getRecord(sandboxId: string): SandboxRecord | undefined {
    return this.entries.get(sandboxId)?.record;
  }

  listRecords(): SandboxRecord[] {
    return Array.from(this.entries.values(), (e) => e.record);
  }

  async create(params: CreateSandboxParams = {}): Promise<SandboxRecord> {
    const templateId = params.templateId ?? this.defaultTemplateId;
    const opts = {
      timeoutMs: params.timeoutMs ?? this.defaultTimeoutMs,
      autoPause: params.autoPause ?? this.defaultAutoPause,
      metadata: params.metadata ?? {},
      envs: mergeEnvs(this.defaultEnvs, params.envs),
    };

    const sandbox = templateId
      ? await this.Sandbox.create(templateId, opts)
      : await this.Sandbox.create(opts);

    const info = await sandbox.getInfo();
    const record: SandboxRecord = {
      sandboxId: info.sandboxId,
      templateId: info.templateId,
      metadata: info.metadata ?? {},
      startedAt: asDate(info.startedAt),
      endAt: asDate(info.endAt),
      state: 'running',
    };

    this.entries.set(record.sandboxId, { sandbox, record });
    return record;
  }

  /**
   * Connect to a sandbox by ID (resumes it automatically if paused).
   */
  async connect(sandboxId: string): Promise<SandboxRecord> {
    const sandbox = await this.Sandbox.connect(sandboxId);
    const info = await sandbox.getInfo();

    const record: SandboxRecord = {
      sandboxId: info.sandboxId,
      templateId: info.templateId,
      metadata: info.metadata ?? {},
      startedAt: asDate(info.startedAt),
      endAt: asDate(info.endAt),
      state: 'running',
    };

    this.entries.set(record.sandboxId, { sandbox, record });
    return record;
  }

  async setTimeout(sandboxId: string, timeoutMs: number): Promise<void> {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    await entry.sandbox.setTimeout(timeoutMs);

    // Refresh endAt (best-effort).
    const info = await entry.sandbox.getInfo();
    entry.record.endAt = asDate(info.endAt);
  }

  async runCommand(
    sandboxId: string,
    command: string,
    opts?: { envs?: Record<string, string> },
  ): Promise<SandboxCommandResult> {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    const envs = mergeEnvs(undefined, opts?.envs);
    return entry.sandbox.commands.run(command, envs ? { envs } : undefined);
  }

  async readFile(sandboxId: string, filePath: string): Promise<string> {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    return entry.sandbox.files.read(filePath);
  }

  async writeFile(sandboxId: string, filePath: string, content: string | Uint8Array): Promise<void> {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    await entry.sandbox.files.write(filePath, content);
  }

  async pause(sandboxId: string): Promise<void> {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    await entry.sandbox.betaPause();
    entry.record.state = 'paused';
  }

  async kill(sandboxId: string): Promise<void> {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      // idempotent
      return;
    }

    await entry.sandbox.kill();
    this.entries.delete(sandboxId);
  }
}
