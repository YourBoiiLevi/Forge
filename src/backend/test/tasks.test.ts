import http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from '../lib/artifact-store';
import { createApp } from '../server';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-tasks-'));
}

async function listen(app: ReturnType<typeof createApp>): Promise<{
  server: http.Server;
  baseUrl: string;
}> {
  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Unexpected server address');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function taskMarkdown(params: {
  id: string;
  title: string;
  type: 1 | 2 | 3 | 'refinery';
  dependencies?: string[];
  branch?: string | null;
  attemptId?: string | null;
}): string {
  const deps = params.dependencies ?? [];
  const branchLine = params.branch === undefined ? '' : `branch: ${params.branch === null ? 'null' : params.branch}\n`;
  const attemptLine =
    params.attemptId === undefined ? '' : `attemptId: ${params.attemptId === null ? 'null' : params.attemptId}\n`;

  return [
    '---',
    `id: ${params.id}`,
    `title: "${params.title}"`,
    `type: ${params.type}`,
    'dependencies:',
    ...deps.map((d) => `  - ${d}`),
    branchLine.trimEnd(),
    attemptLine.trimEnd(),
    '---',
    '',
    '## Description',
    'Test task artifact.',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

describe('tasks API (Task 2.4)', () => {
  const tmpDirs: string[] = [];
  let activeServer: http.Server | undefined;

  afterEach(async () => {
    if (activeServer) {
      const s = activeServer;
      activeServer = undefined;
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    await Promise.all(
      tmpDirs.splice(0, tmpDirs.length).map(async (dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('GET /api/v1/runs/:runId/tasks lists all tasks with summaries and statuses from dag-status.json', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    const app = createApp({ artifactStore: store });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const create = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const created = (await create.json()) as { runId: string };

    await store.writeText(created.runId, 'tasks/task-001.md',
      taskMarkdown({
        id: 'task-001',
        title: 'Set up Express server',
        type: 2,
        dependencies: [],
        branch: 'forge/task-001/attempt-1',
        attemptId: 'attempt-1',
      }),
    );
    await store.writeText(created.runId, 'tasks/task-002.md',
      taskMarkdown({
        id: 'task-002',
        title: 'Implement auth middleware',
        type: 2,
        dependencies: ['task-001'],
        branch: null,
        attemptId: null,
      }),
    );

    await store.writeDagStatus(created.runId, {
      runId: created.runId,
      updatedAt: new Date().toISOString(),
      nodes: {
        'task-001': {
          taskId: 'task-001',
          status: 'DONE',
          currentAttempt: 1,
          maxAttempts: 3,
        },
        'task-002': {
          taskId: 'task-002',
          status: 'RUNNING',
          currentAttempt: 1,
          maxAttempts: 3,
          startedAt: new Date().toISOString(),
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/tasks`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      {
        taskId: 'task-001',
        title: 'Set up Express server',
        type: 2,
        status: 'DONE',
        dependencies: [],
        branch: 'forge/task-001/attempt-1',
      },
      {
        taskId: 'task-002',
        title: 'Implement auth middleware',
        type: 2,
        status: 'RUNNING',
        dependencies: ['task-001'],
      },
    ]);
  });

  it('GET /api/v1/runs/:runId/tasks/:taskId returns task detail including walkthrough when available', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    const app = createApp({ artifactStore: store });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const create = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const created = (await create.json()) as { runId: string };

    await store.writeText(created.runId, 'tasks/task-001.md',
      taskMarkdown({
        id: 'task-001',
        title: 'Set up Express server',
        type: 2,
        dependencies: [],
        branch: 'forge/task-001/attempt-1',
        attemptId: 'attempt-1',
      }),
    );
    await store.writeDagStatus(created.runId, {
      runId: created.runId,
      updatedAt: new Date().toISOString(),
      nodes: {
        'task-001': {
          taskId: 'task-001',
          status: 'MERGED',
          currentAttempt: 1,
          maxAttempts: 3,
          startedAt: '2026-02-09T12:01:00Z',
          completedAt: '2026-02-09T12:05:30Z',
        },
      },
    });

    const walkthroughMd = '---\n\n## Summary\nWalkthrough content\n';
    await store.writeWalkthrough(created.runId, 'task-001', 'attempt-1', walkthroughMd);

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/tasks/task-001`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      taskId: 'task-001',
      title: 'Set up Express server',
      type: 2,
      status: 'MERGED',
      dependencies: [],
      branch: 'forge/task-001/attempt-1',
      startedAt: '2026-02-09T12:01:00Z',
      completedAt: '2026-02-09T12:05:30Z',
      walkthrough: walkthroughMd,
      artifacts: ['tasks/task-001.md', 'task-001/attempt-1/walkthrough.md'],
    });
  });

  it('GET /api/v1/runs/:runId/tasks/:taskId returns 404 for non-existent task', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    const app = createApp({ artifactStore: store });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const create = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const created = (await create.json()) as { runId: string };

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/tasks/task-does-not-exist`);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'TASK_NOT_FOUND' });
  });

  it('GET /api/v1/runs/:runId/tasks returns 404 when run does not exist', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    const app = createApp({ artifactStore: store });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const res = await fetch(`${baseUrl}/api/v1/runs/run_does_not_exist/tasks`);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });
});
