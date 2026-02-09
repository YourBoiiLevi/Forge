import http from 'node:http';

import express from 'express';

import { ArtifactStore } from './lib/artifact-store';
import { EventHub } from './lib/event-stream';
import { HttpError } from './lib/http-error';
import { corsForLocalhost } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { registerApiV1Routes } from './routes/api-v1';

export interface CreateAppOptions {
  /**
   * Optional hook to register additional routes before the 404 handler.
   * Useful for tests and incremental development.
   */
  registerRoutes?: (app: express.Express) => void;

  /** Optional dependency injection for tests. */
  artifactStore?: ArtifactStore;

  /** Optional dependency injection for tests. */
  eventHub?: EventHub;

  /** Override for keepalive interval on NDJSON streams (defaults to 15s). */
  eventStreamKeepaliveMs?: number;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();
  const artifactStore = options.artifactStore ?? ArtifactStore.fromEnv();
  const eventHub = options.eventHub ?? new EventHub();

  app.disable('x-powered-by');

  app.use(corsForLocalhost);
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  registerApiV1Routes(app, {
    artifactStore,
    eventHub,
    eventStreamKeepaliveMs: options.eventStreamKeepaliveMs,
  });

  options.registerRoutes?.(app);

  // 404 handler
  app.use((_req, _res, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'Not Found'));
  });

  // Error handler must be last.
  app.use(errorHandler);

  return app;
}

export interface StartServerOptions {
  port?: number;
  host?: string;
}

function parsePort(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 65535) return undefined;
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 65535) return undefined;
    return n;
  }
  return undefined;
}

export async function startServer(options: StartServerOptions = {}): Promise<http.Server> {
  const app = createApp();
  const port = options.port ?? parsePort(process.env.PORT) ?? 3001;
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';

  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  return server;
}
