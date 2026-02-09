import http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from '../lib/artifact-store';
import { createApp } from '../server';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-artifacts-'));
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

describe('artifacts API (Task 2.5)', () => {
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

  it('GET /api/v1/runs/:runId/artifacts/:path returns raw content and correct Content-Type (markdown)', async () => {
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

    const rel = 'tasks/task-001.md';
    const content = '# Hello\n\nArtifact body.\n';
    await store.writeText(created.runId, rel, content);

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/artifacts/${rel}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    await expect(res.text()).resolves.toBe(content);
  });

  it('returns correct Content-Type for JSON artifacts', async () => {
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

    await store.writeJson(created.runId, 'dag.json', { nodes: [] });
    const raw = await store.readText(created.runId, 'dag.json');

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/artifacts/dag.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.text()).resolves.toBe(raw);
  });

  it('returns 404 for non-existent artifacts', async () => {
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

    const res = await fetch(`${baseUrl}/api/v1/runs/${created.runId}/artifacts/tasks/nope.md`);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
  });

  it('prevents path traversal attempts', async () => {
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

    const traversal = await fetch(
      `${baseUrl}/api/v1/runs/${created.runId}/artifacts/..%2F..%2Fsomewhere%2Fsecret.txt`,
    );
    expect(traversal.status).toBe(404);
    await expect(traversal.json()).resolves.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
  });
});
