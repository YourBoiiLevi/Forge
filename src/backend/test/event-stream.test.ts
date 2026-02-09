import http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore } from '../lib/artifact-store';
import { EventHub, type ForgeEvent } from '../lib/event-stream';
import { createApp } from '../server';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-stream-'));
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

describe('NDJSON event stream (Task 2.3)', () => {
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

  it('streams NDJSON with replay, live events, and keepalives', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);

    const store = new ArtifactStore({ baseDir });
    const eventHub = new EventHub();

    const app = createApp({ artifactStore: store, eventHub, eventStreamKeepaliveMs: 5 });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const created = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const { runId } = (await created.json()) as { runId: string };

    // Emit one live event after the client is connected.
    const raw = await readLinesUntil({
      url: `${baseUrl}/api/v1/runs/${runId}/stream`,
      timeoutMs: 2_000,
      until(lines) {
        const hasReplay = jsonLines(lines).some((e) => e.type === 'run.started');
        const hasKeepalive = lines.some((l) => l.startsWith(':'));
        const hasLive = jsonLines(lines).some((e) => e.type === 'captain.message');
        if (hasReplay && !hasLive) {
          eventHub.emit({
            runId,
            type: 'captain.message',
            data: { content: 'hello', role: 'assistant' },
          });
        }
        return hasReplay && hasKeepalive && hasLive;
      },
    });

    const events = jsonLines(raw);
    const started = events.find((e) => e.type === 'run.started');
    const msg = events.find((e) => e.type === 'captain.message');

    expect(started).toMatchObject({
      type: 'run.started',
      runId,
      seq: 1,
      data: { repoUrl: 'https://github.com/org/repo' },
    });
    expect(msg).toMatchObject({
      type: 'captain.message',
      runId,
      seq: 2,
      data: { content: 'hello', role: 'assistant' },
    });
  });

  it('supports replay via ?after=<eventId>', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);

    const store = new ArtifactStore({ baseDir });
    const eventHub = new EventHub();

    const app = createApp({ artifactStore: store, eventHub, eventStreamKeepaliveMs: 5 });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const created = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const { runId } = (await created.json()) as { runId: string };

    const started = eventHub.getAfter(runId)[0];
    expect(started).toBeTruthy();

    const second = eventHub.emit({
      runId,
      type: 'captain.message',
      data: { content: 'second', role: 'assistant' },
    });
    eventHub.emit({
      runId,
      type: 'captain.message',
      data: { content: 'third', role: 'assistant' },
    });

    const raw = await readLinesUntil({
      url: `${baseUrl}/api/v1/runs/${runId}/stream?after=${encodeURIComponent(started.eventId)}`,
      timeoutMs: 2_000,
      until(lines) {
        return jsonLines(lines).length >= 2;
      },
    });

    const events = jsonLines(raw);
    expect(events[0]).toMatchObject({ eventId: second.eventId, seq: 2 });
  });

  it('evicts old events beyond the per-run buffer capacity', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);

    const store = new ArtifactStore({ baseDir });
    const eventHub = new EventHub({ maxEventsPerRun: 3 });

    const app = createApp({ artifactStore: store, eventHub, eventStreamKeepaliveMs: 5 });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const created = await fetch(`${baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/org/repo' }),
    });
    const { runId } = (await created.json()) as { runId: string };

    // Total events: 1 (run.started) + 4 = 5. With capacity 3, we should retain seq 3..5.
    eventHub.emit({ runId, type: 'captain.message', data: { content: '2', role: 'assistant' } });
    eventHub.emit({ runId, type: 'captain.message', data: { content: '3', role: 'assistant' } });
    eventHub.emit({ runId, type: 'captain.message', data: { content: '4', role: 'assistant' } });
    eventHub.emit({ runId, type: 'captain.message', data: { content: '5', role: 'assistant' } });

    const raw = await readLinesUntil({
      url: `${baseUrl}/api/v1/runs/${runId}/stream`,
      timeoutMs: 2_000,
      until(lines) {
        return jsonLines(lines).length >= 3;
      },
    });

    const events = jsonLines(raw);
    expect(events.map((e) => e.seq)).toEqual([3, 4, 5]);
  });

  it('returns 404 for missing runId', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });
    const eventHub = new EventHub();

    const app = createApp({ artifactStore: store, eventHub });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const res = await fetch(`${baseUrl}/api/v1/runs/run_does_not_exist/stream`);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });
});
