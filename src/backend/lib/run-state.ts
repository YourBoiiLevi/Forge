export type RunStatus =
  | 'planning'
  | 'plan_review'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'failed';

export type RunPhase =
  | 'captain_interview'
  | 'plan_review'
  | 'execution'
  | 'paused'
  | 'completed';

/**
 * Canonical run state persisted at `artifacts/<runId>/run-state.json`.
 *
 * Source of truth: specs/08-artifact-schemas.md (§6).
 */
export interface RunState {
  runId: string;
  repoUrl: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  currentPhase: RunPhase;
  model: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  activeCRs: string[];
  lastEventId: string;
  lastEventSeq: number;
}

export function newPlanningRunState(params: {
  runId: string;
  repoUrl: string;
  model: string;
  now: Date;
}): RunState {
  return {
    runId: params.runId,
    repoUrl: params.repoUrl,
    status: 'planning',
    createdAt: params.now.toISOString(),
    currentPhase: 'captain_interview',
    model: params.model,
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    runningTasks: 0,
    activeCRs: [],
    lastEventId: '',
    lastEventSeq: 0,
  };
}
