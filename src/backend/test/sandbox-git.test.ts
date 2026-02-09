import { describe, expect, it } from 'vitest';

import type { SandboxCommandResult, SandboxInstance, SandboxStatic } from '../lib/sandbox/manager';
import { SandboxManager } from '../lib/sandbox/manager';
import { forgeBranchName, SandboxGit } from '../lib/sandbox/git';

type SbxState = {
  sandboxId: string;
  templateId: string;
  metadata: Record<string, string>;
  startedAt: Date;
  endAt: Date;
  state: 'running' | 'paused' | 'killed';
  commands: Array<{ command: string; envs?: Record<string, string> }>;
};

function makeSandboxStatic(
  run: (command: string, opts?: { envs?: Record<string, string> }) => Promise<SandboxCommandResult>,
): { Sandbox: SandboxStatic; store: Map<string, SbxState> } {
  const store = new Map<string, SbxState>();
  let nextId = 1;

  function makeInstance(state: SbxState): SandboxInstance {
    return {
      sandboxId: state.sandboxId,
      commands: {
        run: async (command, opts) => {
          state.commands.push({ command, envs: opts?.envs });
          return run(command, opts);
        },
      },
      files: {
        read: async () => {
          throw new Error('not implemented');
        },
        write: async () => {
          throw new Error('not implemented');
        },
      },
      getInfo: async () => ({
        sandboxId: state.sandboxId,
        templateId: state.templateId,
        metadata: state.metadata,
        startedAt: state.startedAt,
        endAt: state.endAt,
      }),
      setTimeout: async () => {
        // no-op
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
      const [a0] = args;
      const templateId = typeof a0 === 'string' ? a0 : 'base';

      const sandboxId = `sbx-${nextId++}`;
      const startedAt = new Date('2026-01-01T00:00:00.000Z');
      const endAt = new Date('2026-01-01T01:00:00.000Z');
      const state: SbxState = {
        sandboxId,
        templateId,
        metadata: {},
        startedAt,
        endAt,
        state: 'running',
        commands: [],
      };
      store.set(sandboxId, state);
      return makeInstance(state);
    }) as SandboxStatic['create'],
    connect: async (sandboxId) => {
      const state = store.get(sandboxId);
      if (!state) throw new Error(`Sandbox not found: ${sandboxId}`);
      if (state.state === 'killed') throw new Error(`Sandbox killed: ${sandboxId}`);
      state.state = 'running';
      return makeInstance(state);
    },
  };

  return { Sandbox, store };
}

describe('forgeBranchName', () => {
  it('formats forge/<taskId>/<attemptId>', () => {
    expect(forgeBranchName('auth-login', 1)).toBe('forge/auth-login/1');
    expect(forgeBranchName('task_1', '2')).toBe('forge/task_1/2');
  });

  it('rejects unsafe taskId or non-numeric attemptId', () => {
    expect(() => forgeBranchName('bad/task', 1)).toThrow(/Invalid taskId/i);
    expect(() => forgeBranchName('bad task', 1)).toThrow(/Invalid taskId/i);
    expect(() => forgeBranchName('ok', 'x')).toThrow(/Invalid attemptId/i);
  });
});

describe('SandboxGit', () => {
  it('clones with provided envs (e.g. auth token)', async () => {
    const fake = makeSandboxStatic(async (command, opts) => {
      expect(command).toContain('git clone');
      expect(opts?.envs).toEqual({ GITHUB_TOKEN: 'token-123' });
      return { stdout: 'cloned', stderr: '', exitCode: 0 };
    });
    const mgr = new SandboxManager({ Sandbox: fake.Sandbox });
    const record = await mgr.create();

    const git = new SandboxGit({ manager: mgr, sandboxId: record.sandboxId, retry: { jitterFraction: 0 } });
    await git.clone('https://github.com/acme/repo.git', { envs: { GITHUB_TOKEN: 'token-123' } });

    const state = fake.store.get(record.sandboxId)!;
    expect(state.commands).toHaveLength(1);
  });

  it('uses exponential backoff for push', async () => {
    let pushCalls = 0;
    const sleeps: number[] = [];

    const fake = makeSandboxStatic(async (command) => {
      if (command.includes('git push')) {
        pushCalls++;
        if (pushCalls < 3) return { stdout: '', stderr: 'network', exitCode: 128 };
        return { stdout: 'ok', stderr: '', exitCode: 0 };
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    const mgr = new SandboxManager({ Sandbox: fake.Sandbox });
    const record = await mgr.create();

    const git = new SandboxGit({
      manager: mgr,
      sandboxId: record.sandboxId,
      retry: {
        maxAttempts: 5,
        baseDelayMs: 1000,
        jitterFraction: 0,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => 0.5,
      },
    });

    await git.push('forge/task/1');

    expect(pushCalls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('merges dependency branches in order: fetch then merge per dep', async () => {
    const fake = makeSandboxStatic(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }));
    const mgr = new SandboxManager({ Sandbox: fake.Sandbox });
    const record = await mgr.create();
    const git = new SandboxGit({ manager: mgr, sandboxId: record.sandboxId, retry: { jitterFraction: 0 } });

    await git.mergeDependencyBranches(
      [
        { taskId: 'taskA', attemptId: 1 },
        { taskId: 'taskB', attemptId: 2 },
      ],
      { envs: { GITHUB_TOKEN: 't' } },
    );

    const state = fake.store.get(record.sandboxId)!;
    const cmds = state.commands.map((c) => c.command);

    expect(cmds[0]).toContain('git fetch');
    expect(cmds[0]).toContain('forge/taskA/1');
    expect(cmds[1]).toContain('git merge');
    expect(cmds[1]).toContain('origin/forge/taskA/1');
    expect(cmds[2]).toContain('git fetch');
    expect(cmds[2]).toContain('forge/taskB/2');
    expect(cmds[3]).toContain('git merge');
    expect(cmds[3]).toContain('origin/forge/taskB/2');
  });

  it('creates structured forge commit messages', async () => {
    const fake = makeSandboxStatic(async (command) => {
      if (command.includes('git commit')) {
        expect(command).toContain("forge(task-1): implement thing");
        expect(command).toContain('Attempt: 1');
        expect(command).toContain('Task: task-1');
        expect(command).toContain('Agent: agent-9');
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });
    const mgr = new SandboxManager({ Sandbox: fake.Sandbox });
    const record = await mgr.create();
    const git = new SandboxGit({ manager: mgr, sandboxId: record.sandboxId, retry: { jitterFraction: 0 } });

    await git.commitAll({ taskId: 'task-1', attemptId: 1, agentId: 'agent-9', summary: 'implement thing' });
  });
});
