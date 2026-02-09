import http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from '../lib/artifact-store';
import { createApp } from '../server';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-crs-'));
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

function crMarkdown(params: {
  id: string;
  title: string;
  emitted_by?: string;
  emitted_at?: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  reason?: string;
  affected_tasks?: string[];
}): string {
  return `---
id: ${params.id}
title: "${params.title}"
emitted_by: ${params.emitted_by ?? 'refinery-001'}
emitted_at: "${params.emitted_at ?? '2026-02-10T00:00:00Z'}"
status: ${params.status}
reason: "${params.reason ?? 'Needs plan change'}"
affected_tasks:
${(params.affected_tasks ?? ['task-001']).map((t) => `  - ${t}`).join('\n')}
suggested_changes: |
  Add a new task.
---

## Description
Some details.
`;
}

describe('change requests API (Task 2.6)', () => {
  const tmpDirs: string[] = [];
  let activeServer: http.Server | undefined;

  afterEach(async () => {
    if (activeServer) {
      const s = activeServer;
      activeServer = undefined;
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    await Promise.all(tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('GET /api/v1/runs/:runId/change-requests returns [] when none exist', async () => {
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

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/change-requests`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it('lists all change requests with status', async () => {
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

    await store.writeText(created.runId, 'change-requests/cr-001/change-request.md', crMarkdown({
      id: 'cr-001',
      title: 'First CR',
      status: 'pending',
      reason: 'Reason 1',
      affected_tasks: ['task-001', 'task-002'],
    }));
    await store.writeText(created.runId, 'change-requests/cr-002/change-request.md', crMarkdown({
      id: 'cr-002',
      title: 'Second CR',
      status: 'approved',
      reason: 'Reason 2',
      affected_tasks: ['task-005'],
    }));

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/change-requests`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      crId: 'cr-001',
      title: 'First CR',
      status: 'pending',
      description: 'Reason 1',
      impact: ['task-001', 'task-002'],
    });
    expect(body[1]).toMatchObject({
      crId: 'cr-002',
      title: 'Second CR',
      status: 'approved',
      description: 'Reason 2',
      impact: ['task-005'],
    });
  });

  it('approves a pending CR and enforces 404/409 rules', async () => {
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

    await store.writeText(
      created.runId,
      'change-requests/cr-123/change-request.md',
      crMarkdown({ id: 'cr-123', title: 'Needs approval', status: 'pending' }),
    );

    const approve = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/change-requests/cr-123/approve`, {
      method: 'POST',
    });
    expect(approve.status).toBe(200);
    await expect(approve.json()).resolves.toEqual({ status: 'approved' });

    const updated = await store.readText(created.runId, 'change-requests/cr-123/change-request.md');
    expect(updated).toContain('\nstatus: approved\n');

    const approveAgain = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/change-requests/cr-123/approve`, {
      method: 'POST',
    });
    expect(approveAgain.status).toBe(409);
    await expect(approveAgain.json()).resolves.toMatchObject({ code: 'INVALID_STATE' });

    const missing = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/change-requests/cr-nope/approve`, {
      method: 'POST',
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: 'CR_NOT_FOUND' });

    await store.writeText(
      created.runId,
      'change-requests/cr-999/change-request.md',
      crMarkdown({ id: 'cr-999', title: 'Already rejected', status: 'rejected' }),
    );

    const rejected = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/change-requests/cr-999/approve`, {
      method: 'POST',
    });
    expect(rejected.status).toBe(409);
    await expect(rejected.json()).resolves.toMatchObject({ code: 'INVALID_STATE' });
  });
});
