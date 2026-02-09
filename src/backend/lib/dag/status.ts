import type { TaskStatus } from '../task-artifact';

export const TASK_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  PENDING: ['RUNNING'],
  RUNNING: ['DONE', 'FAILED', 'STALE'],
  DONE: ['MERGE_READY'],
  MERGE_READY: ['MERGED'],
  MERGED: [],
  FAILED: ['PENDING'],
  STALE: ['PENDING'],
} as const;

export function canTransitionStatus(prev: TaskStatus, next: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[prev].includes(next);
}

export function assertValidStatusTransition(prev: TaskStatus, next: TaskStatus): void {
  if (prev === next) {
    throw new Error(`Invalid status transition: ${prev} -> ${next} (no-op)`);
  }
  if (!canTransitionStatus(prev, next)) {
    throw new Error(`Invalid status transition: ${prev} -> ${next}`);
  }
}
