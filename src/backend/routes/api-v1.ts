import { randomUUID } from 'node:crypto';

import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';

import { ArtifactStore } from '../lib/artifact-store';
import { HttpError } from '../lib/http-error';
import { newPlanningRunState, type RunState } from '../lib/run-state';

function isErrno(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_REQUEST', `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, 'INVALID_REQUEST', `${label} must not be empty`);
  }
  return trimmed;
}

function parseRepoUrl(value: unknown): string {
  const raw = assertNonEmptyString(value, 'repoUrl');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'repoUrl must be a valid URL');
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new HttpError(400, 'INVALID_REQUEST', 'repoUrl must use http or https');
  }

  // Preserve the original string (minus surrounding whitespace).
  return raw;
}

function parseModel(value: unknown): string {
  if (value === undefined) {
    return process.env.FORGE_MODEL?.trim() || 'claude-sonnet-4-20250514';
  }
  return assertNonEmptyString(value, 'model');
}

function newRunId(): string {
  // Keep it path-segment-safe (no slashes), and compact for UI.
  const id = randomUUID().replaceAll('-', '').slice(0, 12);
  return `run_${id}`;
}

async function readRunStateOrThrow(store: ArtifactStore, runId: string): Promise<RunState> {
  try {
    return await store.readRunState<RunState>(runId);
  } catch (err) {
    if (isErrno(err) && err.code === 'ENOENT') {
      throw new HttpError(404, 'RUN_NOT_FOUND', 'Run not found', { runId });
    }
    // Invalid runId format or traversal protection errors should not leak details.
    if (err instanceof Error && /runId/.test(err.message)) {
      throw new HttpError(404, 'RUN_NOT_FOUND', 'Run not found', { runId });
    }
    throw err;
  }
}

async function writeRunState(store: ArtifactStore, state: RunState): Promise<void> {
  await store.writeRunState(state.runId, state);
}

export function registerApiV1Routes(app: Express, options: { artifactStore: ArtifactStore }): void {
  const router = express.Router();
  const store = options.artifactStore;

  // --- Runs ---

  router.post(
    '/runs',
    asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const repoUrl = parseRepoUrl(body.repoUrl);
    const model = parseModel(body.model);

    const runId = newRunId();
    const state = newPlanningRunState({ runId, repoUrl, model, now: new Date() });

    await store.ensureRunInitialized(runId);
    await writeRunState(store, state);

    res.status(201).json({ runId, status: state.status });
    }),
  );

  router.get(
    '/runs/:runId',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      const state = await readRunStateOrThrow(store, runId);
      res.status(200).json(state);
    }),
  );

  router.post(
    '/runs/:runId/pause',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      const state = await readRunStateOrThrow(store, runId);

    if (state.status === 'paused' || state.status === 'completed' || state.status === 'failed') {
      throw new HttpError(409, 'INVALID_STATE', 'Run cannot be paused in its current state', {
        runId,
        status: state.status,
      });
    }

    // MVP: pause is only meaningful once tasks are being scheduled/executed.
    if (state.status !== 'executing') {
      throw new HttpError(409, 'INVALID_STATE', 'Run cannot be paused before execution starts', {
        runId,
        status: state.status,
      });
    }

    const next: RunState = {
      ...state,
      status: 'paused',
      currentPhase: 'paused',
    };

      await writeRunState(store, next);
      res.status(200).json({ status: next.status });
    }),
  );

  router.post(
    '/runs/:runId/resume',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      const state = await readRunStateOrThrow(store, runId);

    if (state.status !== 'paused') {
      throw new HttpError(409, 'INVALID_STATE', 'Run is not paused', { runId, status: state.status });
    }

    const nowIso = new Date().toISOString();
    const next: RunState = {
      ...state,
      status: 'executing',
      currentPhase: 'execution',
      startedAt: state.startedAt ?? nowIso,
    };

      await writeRunState(store, next);
      res.status(200).json({ status: next.status });
    }),
  );

  app.use('/api/v1', router);
}
