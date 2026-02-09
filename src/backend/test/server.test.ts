import http from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { HttpError } from '../lib/http-error';
import { createApp } from '../server';

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

describe('server (Task 2.1)', () => {
  let activeServer: http.Server | undefined;

  afterEach(async () => {
    if (!activeServer) return;
    const s = activeServer;
    activeServer = undefined;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  });

  it('responds to health check', async () => {
    const app = createApp();
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });

  it('formats HttpError using the standard error envelope', async () => {
    const app = createApp({
      registerRoutes(app) {
        app.get('/boom', () => {
          throw new HttpError(400, 'INVALID_REQUEST', 'Bad input', { field: 'repoUrl' });
        });
      },
    });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const res = await fetch(`${baseUrl}/boom`);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Bad input',
      code: 'INVALID_REQUEST',
      details: { field: 'repoUrl' },
    });
  });

  it('formats unknown errors as INTERNAL_ERROR without leaking details', async () => {
    const app = createApp({
      registerRoutes(app) {
        app.get('/crash', () => {
          throw new Error('secret: do not leak');
        });
      },
    });
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const res = await fetch(`${baseUrl}/crash`);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Internal Error',
      code: 'INTERNAL_ERROR',
    });
  });

  it('allows localhost origins via CORS (simple request + preflight)', async () => {
    const app = createApp();
    const { server, baseUrl } = await listen(app);
    activeServer = server;

    const origin = 'http://localhost:5173';

    const res = await fetch(`${baseUrl}/health`, {
      headers: {
        Origin: origin,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);

    const preflight = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
