import { describe, expect, it } from 'vitest';

import type { SandboxInstance, SandboxStatic } from '../lib/sandbox/manager';
import { SandboxManager } from '../lib/sandbox/manager';

type SbxState = {
  sandboxId: string;
  templateId: string;
  metadata: Record<string, string>;
  startedAt: Date;
  endAt: Date;
  state: 'running' | 'paused' | 'killed';
  files: Map<string, string | Uint8Array>;
  createdEnvs?: Record<string, string>;
  lastCommand?: { command: string; envs?: Record<string, string> };
};

function makeFakeSandboxStatic(): { Sandbox: SandboxStatic; store: Map<string, SbxState> } {
  const store = new Map<string, SbxState>();
  let nextId = 1;

  function makeInstance(state: SbxState): SandboxInstance {
    return {
      sandboxId: state.sandboxId,
      commands: {
        run: async (command, opts) => {
          state.lastCommand = { command, envs: opts?.envs };
          return { stdout: `ok:${command}`, stderr: '', exitCode: 0 };
        },
      },
      files: {
        read: async (filePath) => {
          if (!state.files.has(filePath)) {
            throw new Error(`ENOENT: ${filePath}`);
          }
          const v = state.files.get(filePath)!;
          if (typeof v === 'string') return v;
          return Buffer.from(v).toString('utf8');
        },
        write: async (filePath, content) => {
          state.files.set(filePath, content);
        },
      },
      getInfo: async () => ({
        sandboxId: state.sandboxId,
        templateId: state.templateId,
        metadata: state.metadata,
        startedAt: state.startedAt,
        endAt: state.endAt,
      }),
      setTimeout: async (timeoutMs) => {
        state.endAt = new Date(Date.now() + timeoutMs);
      },
      betaPause: async () => {
        if (state.state === 'paused') return false;
        state.state = 'paused';
        return true;
      },
      kill: async () => {
        state.state = 'killed';
      },
    };
  }

  const Sandbox: SandboxStatic = {
    create: (async (...args: unknown[]) => {
      const [a0, a1] = args;
      const templateId = typeof a0 === 'string' ? a0 : 'base';
      const opts = (typeof a0 === 'string' ? a1 : a0) as
        | {
            timeoutMs?: number;
            autoPause?: boolean;
            metadata?: Record<string, string>;
            envs?: Record<string, string>;
          }
        | undefined;

      const sandboxId = `sbx-${nextId++}`;
      const startedAt = new Date('2026-01-01T00:00:00.000Z');
      const endAt = new Date(startedAt.getTime() + (opts?.timeoutMs ?? 60_000));
      const state: SbxState = {
        sandboxId,
        templateId,
        metadata: opts?.metadata ?? {},
        startedAt,
        endAt,
        state: 'running',
        files: new Map(),
        createdEnvs: opts?.envs,
      };
      store.set(sandboxId, state);
      return makeInstance(state);
    }) as SandboxStatic['create'],
    connect: async (sandboxId) => {
      const state = store.get(sandboxId);
      if (!state) {
        throw new Error(`Sandbox not found: ${sandboxId}`);
      }
      if (state.state === 'killed') {
        throw new Error(`Sandbox killed: ${sandboxId}`);
      }
      state.state = 'running';
      return makeInstance(state);
    },
  };

  return { Sandbox, store };
}

describe('SandboxManager', () => {
  it('creates sandbox, stores metadata, and injects envs at create-time', async () => {
    const fake = makeFakeSandboxStatic();
    const mgr = new SandboxManager({
      Sandbox: fake.Sandbox,
      templateId: 'tpl-123',
      defaultTimeoutMs: 10_000,
      defaultEnvs: { A: '1', B: '2' },
    });

    const record = await mgr.create({ metadata: { taskId: 'task-1', attemptId: '1' }, envs: { B: 'x', C: '3' } });

    expect(record.sandboxId).toMatch(/^sbx-/);
    expect(record.templateId).toBe('tpl-123');
    expect(record.metadata).toEqual({ taskId: 'task-1', attemptId: '1' });
    expect(record.state).toBe('running');
    expect(mgr.getRecord(record.sandboxId)).toEqual(record);

    const state = fake.store.get(record.sandboxId);
    expect(state?.createdEnvs).toEqual({ A: '1', B: 'x', C: '3' });
  });

  it('runs commands with per-command envs', async () => {
    const fake = makeFakeSandboxStatic();
    const mgr = new SandboxManager({ Sandbox: fake.Sandbox });

    const record = await mgr.create();
    const res = await mgr.runCommand(record.sandboxId, 'echo hello', { envs: { X: 'y' } });

    expect(res.exitCode).toBe(0);
    const state = fake.store.get(record.sandboxId);
    expect(state?.lastCommand).toEqual({ command: 'echo hello', envs: { X: 'y' } });
  });

  it('pause + connect preserves filesystem state', async () => {
    const fake = makeFakeSandboxStatic();
    const mgr = new SandboxManager({ Sandbox: fake.Sandbox });

    const record1 = await mgr.create({ metadata: { taskId: 't', attemptId: '1' } });
    await mgr.writeFile(record1.sandboxId, '/repo/hello.txt', 'hi');
    await mgr.pause(record1.sandboxId);
    expect(mgr.getRecord(record1.sandboxId)?.state).toBe('paused');

    const record2 = await mgr.connect(record1.sandboxId);
    expect(record2.state).toBe('running');
    await expect(mgr.readFile(record2.sandboxId, '/repo/hello.txt')).resolves.toBe('hi');
  });

  it('kill removes tracking and is idempotent', async () => {
    const fake = makeFakeSandboxStatic();
    const mgr = new SandboxManager({ Sandbox: fake.Sandbox });

    const record = await mgr.create();
    await mgr.kill(record.sandboxId);
    expect(mgr.getRecord(record.sandboxId)).toBeUndefined();
    await expect(mgr.kill(record.sandboxId)).resolves.toBeUndefined();
  });
});
