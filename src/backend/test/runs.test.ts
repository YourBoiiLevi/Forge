import http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from '../lib/artifact-store';
import type { RunState } from '../lib/run-state';
import { createApp } from '../server';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-runs-'));
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

describe('runs API (Task 2.2)', () => {
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

  it('POST /api/v1/runs creates a run and initializes artifact structure', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    const app = createApp({ artifactStore: store });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const res = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { runId: string; status: string };
    expect(body.status).toBe('planning');
    expect(body.runId).toMatch(/^run_[a-f0-9]{12}$/);

    // Directory structure
    await expect(fs.stat(path.join(baseDir, body.runId))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(baseDir, body.runId, 'specs'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(baseDir, body.runId, 'tasks'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(baseDir, body.runId, 'change-requests'))).resolves.toBeTruthy();

    // Run state persisted
    const state = await store.readRunState<RunState>(body.runId);
    expect(state).toMatchObject({
      runId: body.runId,
      repoUrl: 'https://github.com/org/repo',
      status: 'planning',
      currentPhase: 'captain_interview',
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      runningTasks: 0,
      activeCRs: [],
      lastEventId: expect.stringMatching(/^evt_/),
      lastEventSeq: 1,
    });
    expect(state.createdAt).toEqual(expect.any(String));
    expect(state.model).toEqual(expect.any(String));
  });

  it('GET /api/v1/runs/:runId returns RunState; missing runId returns 404', async () => {
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

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}`);
    expect(res.status).toBe(200);
    const state = (await res.json()) as RunState;
    expect(state.runId).toBe(created.runId);
    expect(state.repoUrl).toBe('https://github.com/org/repo');
    expect(state.status).toBe('planning');

    const missing = await fetch(`${baseUrl}/api/v1/runs/run_does_not_exist`);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });

  it('pause/resume transitions status correctly and enforces 409 conflict rules', async () => {
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

    // Move the run to executing so pause/resume are meaningful (Task 2.2 scope only).
    const planning = await store.readRunState<RunState>(created.runId);
    await store.writeRunState(created.runId, {
      ...planning,
      status: 'executing',
      currentPhase: 'execution',
      startedAt: new Date().toISOString(),
    });

    const pause = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/pause`, { method: 'POST' });
    expect(pause.status).toBe(200);
    await expect(pause.json()).resolves.toEqual({ status: 'paused' });
    await expect(store.readRunState<RunState>(created.runId)).resolves.toMatchObject({
      status: 'paused',
      currentPhase: 'paused',
    });

    const pauseAgain = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/pause`, { method: 'POST' });
    expect(pauseAgain.status).toBe(409);
    await expect(pauseAgain.json()).resolves.toMatchObject({ code: 'INVALID_STATE' });

    const resume = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/resume`, { method: 'POST' });
    expect(resume.status).toBe(200);
    await expect(resume.json()).resolves.toEqual({ status: 'executing' });
    await expect(store.readRunState<RunState>(created.runId)).resolves.toMatchObject({
      status: 'executing',
      currentPhase: 'execution',
    });

    const resumeAgain = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/resume`, { method: 'POST' });
    expect(resumeAgain.status).toBe(409);
    await expect(resumeAgain.json()).resolves.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('POST /api/v1/runs validates request body', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    const app = createApp({ artifactStore: store });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const res = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
