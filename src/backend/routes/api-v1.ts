import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';

import { ArtifactStore } from '../lib/artifact-store';
import {
  parseChangeRequestArtifactFrontmatter,
  setYamlFrontmatterScalar,
  type ChangeRequestStatus,
} from '../lib/change-request-artifact';
import type { EventHub } from '../lib/event-stream';
import { HttpError } from '../lib/http-error';
import { parseTaskArtifactFrontmatter, type TaskStatus, type TaskType } from '../lib/task-artifact';
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

function assertPathSegmentOrNotFound(value: string, label: string, notFoundCode: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) {
    throw new HttpError(404, notFoundCode, 'Not found', { [label]: value });
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..') {
    throw new HttpError(404, notFoundCode, 'Not found', { [label]: value });
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

async function readChangeRequestMarkdownOrThrow(
  store: ArtifactStore,
  runId: string,
  crId: string,
): Promise<string> {
  const rel = `change-requests/${crId}/change-request.md`;
  try {
    return await store.readText(runId, rel);
  } catch (err) {
    if (isErrno(err) && err.code === 'ENOENT') {
      throw new HttpError(404, 'CR_NOT_FOUND', 'Change request not found', { runId, crId });
    }
    throw err;
  }
}

function parseAfterQuery(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function contentTypeForArtifactPath(relPosixPath: string): string {
  const ext = path.posix.extname(relPosixPath).toLowerCase();
  switch (ext) {
    case '.json':
      return 'application/json; charset=utf-8';
    case '.ndjson':
      return 'application/x-ndjson; charset=utf-8';
    case '.md':
      return 'text/markdown; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

type DagStatus = {
  runId: string;
  updatedAt: string;
  nodes: Record<
    string,
    {
      taskId: string;
      status: TaskStatus;
      currentAttempt: number;
      maxAttempts: number;
      assignedAgent?: string;
      startedAt?: string;
      completedAt?: string;
      lastError?: string;
    }
  >;
};

async function readDagStatusOrUndefined(store: ArtifactStore, runId: string): Promise<DagStatus | undefined> {
  try {
    return await store.readDagStatus<DagStatus>(runId);
  } catch (err) {
    if (isErrno(err) && err.code === 'ENOENT') return undefined;
    throw err;
  }
}

export function registerApiV1Routes(
  app: Express,
  options: { artifactStore: ArtifactStore; eventHub: EventHub; eventStreamKeepaliveMs?: number },
): void {
  const router = express.Router();
  const store = options.artifactStore;
  const eventHub = options.eventHub;
  const keepaliveMs = options.eventStreamKeepaliveMs ?? 15_000;

  // --- Runs ---

  router.post(
    '/runs',
    asyncHandler(async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const repoUrl = parseRepoUrl(body.repoUrl);
      const model = parseModel(body.model);

      const runId = newRunId();
      const state = newPlanningRunState({ runId, repoUrl, model, now: new Date() });

      const started = eventHub.emit({
        runId,
        type: 'run.started',
        data: { repoUrl },
      });

      const persisted: RunState = {
        ...state,
        lastEventId: started.eventId,
        lastEventSeq: started.seq,
      };

      await store.ensureRunInitialized(runId);
      await writeRunState(store, persisted);

      res.status(201).json({ runId, status: persisted.status });
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

      const evt = eventHub.emit({
        runId,
        type: 'run.paused',
        data: { reason: 'user' },
      });

      const persisted: RunState = {
        ...next,
        lastEventId: evt.eventId,
        lastEventSeq: evt.seq,
      };

      await writeRunState(store, persisted);
      res.status(200).json({ status: persisted.status });
    }),
  );

  router.post(
    '/runs/:runId/resume',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      const state = await readRunStateOrThrow(store, runId);

      if (state.status !== 'paused') {
        throw new HttpError(409, 'INVALID_STATE', 'Run is not paused', {
          runId,
          status: state.status,
        });
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

  router.get(
    '/runs/:runId/stream',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;

      // Validate run exists before switching to streaming mode.
      await readRunStateOrThrow(store, runId);

      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Avoid server-side timeouts on long-lived connections.
      req.socket.setTimeout(0);
      res.socket?.setTimeout(0);

      // Ensure headers are sent immediately (where supported).
      res.flushHeaders?.();

      const afterEventId = parseAfterQuery((req.query as Record<string, unknown>).after);

      // Replay buffered events if resuming.
      const replay = eventHub.getAfter(runId, afterEventId);
      for (const event of replay) {
        res.write(`${JSON.stringify(event)}\n`);
      }

      // Subscribe to live events.
      const unsubscribe = eventHub.subscribe(runId, (event) => {
        res.write(`${JSON.stringify(event)}\n`);
      });

      // Keepalive comments to prevent proxy timeouts.
      const keepalive = setInterval(() => {
        res.write(': keepalive\n');
      }, keepaliveMs);

      req.on('close', () => {
        unsubscribe();
        clearInterval(keepalive);
      });
    }),
  );

  // --- Captain ---

  router.post(
    '/captain/message',
    asyncHandler(async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const runId = assertNonEmptyString(body.runId, 'runId');
      const message = assertNonEmptyString(body.message, 'message');

      const state = await readRunStateOrThrow(store, runId);

      if (state.status !== 'planning' || state.currentPhase !== 'captain_interview') {
        throw new HttpError(409, 'INVALID_STATE', 'Run is not in the captain interview phase', {
          runId,
          status: state.status,
          phase: state.currentPhase,
        });
      }

      // Emit the user message so the UI/SDK can render the chat transcript.
      eventHub.emit({
        runId,
        type: 'captain.message',
        data: { content: message, role: 'user' },
      });

      // MVP placeholder until the Captain agent is implemented.
      const reply = eventHub.emit({
        runId,
        type: 'captain.message',
        data: { content: 'Message received.', role: 'assistant' },
      });

      await writeRunState(store, {
        ...state,
        lastEventId: reply.eventId,
        lastEventSeq: reply.seq,
      });

      res.status(202).json({ acknowledged: true });
    }),
  );

  // --- Tasks ---

  router.get(
    '/runs/:runId/tasks',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      await readRunStateOrThrow(store, runId);

      const dagStatus = await readDagStatusOrUndefined(store, runId);

      const tasksDir = store.resolveRunArtifactPath(runId, 'tasks');
      let entries: Dirent[];
      try {
        entries = await fs.readdir(tasksDir, { withFileTypes: true });
      } catch (err) {
        if (isErrno(err) && err.code === 'ENOENT') {
          // Run exists (validated above) but tasks/ may not yet be populated.
          res.status(200).json([]);
          return;
        }
        throw err;
      }

      const summaries = await Promise.all(
        entries
          .filter((e) => e.isFile() && e.name.endsWith('.md'))
          .map(async (e) => {
            const taskId = path.basename(e.name, '.md');
            const md = await fs.readFile(path.join(tasksDir, e.name), 'utf8');

            let fm;
            try {
              fm = parseTaskArtifactFrontmatter(md);
            } catch {
              throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to load tasks');
            }

            const status = dagStatus?.nodes?.[taskId]?.status ?? 'PENDING';

            const out: {
              taskId: string;
              title: string;
              type: TaskType;
              status: TaskStatus;
              dependencies: string[];
              branch?: string;
            } = {
              taskId,
              title: fm.title,
              type: fm.type,
              status,
              dependencies: fm.dependencies,
            };

            if (typeof fm.branch === 'string' && fm.branch.trim()) {
              out.branch = fm.branch;
            }

            return out;
          }),
      );

      summaries.sort((a, b) => a.taskId.localeCompare(b.taskId));
      res.status(200).json(summaries);
    }),
  );

  router.get(
    '/runs/:runId/tasks/:taskId',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      const taskId = assertPathSegmentOrNotFound(req.params.taskId, 'taskId', 'TASK_NOT_FOUND');

      await readRunStateOrThrow(store, runId);

      const taskPath = `tasks/${taskId}.md`;
      let md: string;
      try {
        md = await store.readText(runId, taskPath);
      } catch (err) {
        if (isErrno(err) && err.code === 'ENOENT') {
          throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found', { runId, taskId });
        }
        throw err;
      }

      let fm;
      try {
        fm = parseTaskArtifactFrontmatter(md);
      } catch {
        throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to load task', { runId, taskId });
      }

      const dagStatus = await readDagStatusOrUndefined(store, runId);
      const node = dagStatus?.nodes?.[taskId];
      const status = node?.status ?? 'PENDING';

      const artifacts: string[] = [taskPath];
      let walkthrough: string | undefined;

      if (typeof fm.attemptId === 'string' && fm.attemptId.trim()) {
        const attemptId = assertPathSegmentOrNotFound(fm.attemptId, 'attemptId', 'TASK_NOT_FOUND');
        const walkthroughRel = `${taskId}/${attemptId}/walkthrough.md`;
        const exists = await store.exists(runId, walkthroughRel);
        if (exists) {
          walkthrough = await store.readText(runId, walkthroughRel);
          artifacts.push(walkthroughRel);
        }
      }

      const out: {
        taskId: string;
        title: string;
        type: TaskType;
        status: TaskStatus;
        dependencies: string[];
        branch?: string;
        startedAt?: string;
        completedAt?: string;
        walkthrough?: string;
        artifacts: string[];
      } = {
        taskId,
        title: fm.title,
        type: fm.type,
        status,
        dependencies: fm.dependencies,
        artifacts,
      };

      if (typeof fm.branch === 'string' && fm.branch.trim()) {
        out.branch = fm.branch;
      }
      if (node?.startedAt) out.startedAt = node.startedAt;
      if (node?.completedAt) out.completedAt = node.completedAt;
      if (walkthrough !== undefined) out.walkthrough = walkthrough;

      res.status(200).json(out);
    }),
  );

  // --- Artifacts ---

  // --- Change Requests ---

  router.get(
    '/runs/:runId/change-requests',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      await readRunStateOrThrow(store, runId);

      const crDir = store.resolveRunArtifactPath(runId, 'change-requests');
      let entries: Dirent[];
      try {
        entries = await fs.readdir(crDir, { withFileTypes: true });
      } catch (err) {
        if (isErrno(err) && err.code === 'ENOENT') {
          res.status(200).json([]);
          return;
        }
        throw err;
      }

      const items = await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map(async (e) => {
            const crId = e.name;
            let md: string;
            try {
              md = await store.readText(runId, `change-requests/${crId}/change-request.md`);
            } catch (err) {
              if (isErrno(err) && err.code === 'ENOENT') {
                // Ignore incomplete CR directories.
                return undefined;
              }
              // Ignore traversal/invalid-path rejections (e.g. unexpected directory names).
              if (err instanceof Error && /artifact path/.test(err.message)) {
                return undefined;
              }
              throw err;
            }

            let fm;
            try {
              fm = parseChangeRequestArtifactFrontmatter(md);
            } catch {
              throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to load change requests');
            }

            const out: {
              crId: string;
              title: string;
              emittedBy: string;
              status: ChangeRequestStatus;
              description: string;
              impact: string[];
              createdAt: string;
            } = {
              crId: fm.id,
              title: fm.title,
              emittedBy: fm.emitted_by,
              status: fm.status,
              description: fm.reason,
              impact: fm.affected_tasks,
              createdAt: fm.emitted_at,
            };

            return out;
          }),
      );

      const filtered = items.filter((x): x is NonNullable<typeof x> => x !== undefined);
      filtered.sort((a, b) => a.crId.localeCompare(b.crId));
      res.status(200).json(filtered);
    }),
  );

  router.post(
    '/runs/:runId/change-requests/:crId/approve',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      const crId = assertPathSegmentOrNotFound(req.params.crId, 'crId', 'CR_NOT_FOUND');
      await readRunStateOrThrow(store, runId);

      const md = await readChangeRequestMarkdownOrThrow(store, runId, crId);

      let fm;
      try {
        fm = parseChangeRequestArtifactFrontmatter(md);
      } catch {
        throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to load change request', { runId, crId });
      }

      if (fm.status !== 'pending') {
        throw new HttpError(409, 'INVALID_STATE', 'Change request is not pending', {
          runId,
          crId,
          status: fm.status,
        });
      }

      const updated = setYamlFrontmatterScalar(md, 'status', 'approved');
      await store.writeText(runId, `change-requests/${crId}/change-request.md`, updated);

      res.status(200).json({ status: 'approved' });
    }),
  );

  router.get(
    '/runs/:runId/artifacts/:artifactPath(*)',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.runId;
      await readRunStateOrThrow(store, runId);

      const artifactPathRaw = (req.params as Record<string, unknown>).artifactPath;
      if (typeof artifactPathRaw !== 'string' || !artifactPathRaw) {
        throw new HttpError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found', { runId });
      }

      const artifactPath = artifactPathRaw;

      let absolutePath: string;
      try {
        absolutePath = store.resolveRunArtifactPath(runId, artifactPath);
      } catch {
        throw new HttpError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found', {
          runId,
          artifactPath,
        });
      }

      let data: Buffer;
      try {
        data = await fs.readFile(absolutePath);
      } catch (err) {
        if (isErrno(err) && (err.code === 'ENOENT' || err.code === 'EISDIR')) {
          throw new HttpError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found', {
            runId,
            artifactPath,
          });
        }
        throw err;
      }

      res.status(200);
      res.setHeader('Content-Type', contentTypeForArtifactPath(artifactPath));
      res.send(data);
    }),
  );

  app.use('/api/v1', router);
}
