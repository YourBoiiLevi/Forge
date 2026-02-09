import http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from '../lib/artifact-store';
import { EventHub, type ForgeEvent } from '../lib/event-stream';
import type { RunState } from '../lib/run-state';
import { createApp } from '../server';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-captain-'));
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

async function readLinesUntil(params: {
  url: string;
  until: (lines: string[]) => boolean;
  timeoutMs: number;
}): Promise<string[]> {
  const controller = new AbortController();
  const res = await fetch(params.url, { signal: controller.signal });
  if (!res.body) throw new Error('Expected streaming response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let buffer = '';
  const lines: string[] = [];

  try {
    while (!params.until(lines)) {
      if (Date.now() - startedAt > params.timeoutMs) {
        throw new Error(`Timed out reading stream after ${params.timeoutMs}ms; got ${lines.length} lines`);
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const p of parts) {
        lines.push(p);
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    controller.abort();
  }

  return lines;
}

function jsonLines(raw: string[]): ForgeEvent[] {
  return raw
    .filter((l) => l.trim() !== '' && !l.startsWith(':'))
    .map((l) => JSON.parse(l) as ForgeEvent);
}

describe('captain message API (Task 2.7)', () => {
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

  it('acknowledges with 202 and emits captain.message events on the stream', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);

    const store = new ArtifactStore({ baseDir });
    const eventHub = new EventHub();

    const app = createApp({ artifactStore: store, eventHub });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const created = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const { runId } = (await created.json()) as { runId: string };

    const send = await fetch(`${baseUrl}/api/v1/captain/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, message: 'Build a REST API' }),
    });
    expect(send.status).toBe(202);
    await expect(send.json()).resolves.toEqual({ acknowledged: true });

    const raw = await readLinesUntil({
      url: `${baseUrl}/api/v1/runs/${runId}/stream`,
      timeoutMs: 2_000,
      until(lines) {
        return jsonLines(lines).length >= 3;
      },
    });

    const events = jsonLines(raw);
    expect(events[0]).toMatchObject({ type: 'run.started', runId, seq: 1 });
    expect(events[1]).toMatchObject({
      type: 'captain.message',
      runId,
      seq: 2,
      data: { content: 'Build a REST API', role: 'user' },
    });
    expect(events[2]).toMatchObject({
      type: 'captain.message',
      runId,
      seq: 3,
      data: { content: 'Message received.', role: 'assistant' },
    });
  });

  it('returns 409 if the run is not in the planning interview phase', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);

    const store = new ArtifactStore({ baseDir });
    const eventHub = new EventHub();

    const app = createApp({ artifactStore: store, eventHub });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const created = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const { runId } = (await created.json()) as { runId: string };

    const planning = await store.readRunState<RunState>(runId);
    await store.writeRunState(runId, {
      ...planning,
      status: 'executing',
      currentPhase: 'execution',
      startedAt: new Date().toISOString(),
    });

    const res = await fetch(`${baseUrl}/api/v1/captain/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, message: 'hello' }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'INVALID_STATE' });
  });
});
