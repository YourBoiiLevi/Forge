import { describe, expect, it } from 'vitest';

import { assertValidStatusTransition, canTransitionStatus } from '../lib/dag/status';
import { topologicalSort, validateDag } from '../lib/dag/validation';
import type { DAG } from '../lib/dag/types';
import type { TaskStatus } from '../lib/task-artifact';

function makeDag(
  overrides?: Partial<Omit<DAG, 'metadata'>> & { metadata?: Partial<DAG['metadata']> },
): DAG {
  const dag: DAG = {
    version: 1,
    runId: 'run_test',
    nodes: [],
    metadata: {
      createdAt: new Date('2026-02-09T14:30:00Z').toISOString(),
      createdBy: 'captain',
      totalTasks: 0,
      totalRefineries: 0,
    },
  };
  return { ...dag, ...overrides, metadata: { ...dag.metadata, ...(overrides?.metadata ?? {}) } };
}

describe('dag validation (Task 3.1)', () => {
  it('rejects dangling dependency references', () => {
    const dag = makeDag({
      nodes: [
        {
          id: 'task-001',
          type: 'task',
          agentType: 1,
          dependencies: ['task-999'],
          status: 'PENDING',
        },
      ],
      metadata: { totalTasks: 1, totalRefineries: 0 },
    });

    const issues = validateDag(dag);
    expect(issues.some((i) => i.code === 'DAG_UNKNOWN_DEPENDENCY')).toBe(true);
  });

  it('detects cycles', () => {
    const dag = makeDag({
      nodes: [
        {
          id: 'task-a',
          type: 'task',
          agentType: 1,
          dependencies: ['task-b'],
          status: 'PENDING',
        },
        {
          id: 'task-b',
          type: 'task',
          agentType: 1,
          dependencies: ['task-a'],
          status: 'PENDING',
        },
      ],
      metadata: { totalTasks: 2, totalRefineries: 0 },
    });

    const issues = validateDag(dag);
    const cycle = issues.find((i) => i.code === 'DAG_CYCLE');
    expect(cycle).toBeTruthy();
    expect(cycle?.cycle?.join(' ')).toContain('task-a');
    expect(cycle?.cycle?.join(' ')).toContain('task-b');
  });

  it('topological sort succeeds for a valid DAG', () => {
    const dag = makeDag({
      nodes: [
        {
          id: 'task-000',
          type: 'task',
          agentType: 1,
          dependencies: [],
          status: 'PENDING',
        },
        {
          id: 'task-001',
          type: 'task',
          agentType: 2,
          dependencies: ['task-000'],
          status: 'PENDING',
        },
        {
          id: 'task-002',
          type: 'task',
          agentType: 2,
          dependencies: ['task-000'],
          status: 'PENDING',
        },
        {
          id: 'refinery-001',
          type: 'refinery',
          agentType: 'refinery',
          dependencies: ['task-001', 'task-002'],
          status: 'PENDING',
        },
        {
          id: 'task-003',
          type: 'task',
          agentType: 3,
          dependencies: ['refinery-001'],
          status: 'PENDING',
        },
      ],
      metadata: { totalTasks: 4, totalRefineries: 1 },
    });

    const order = topologicalSort(dag);
    expect(order).toHaveLength(dag.nodes.length);

    const idx = new Map(order.map((id, i) => [id, i] as const));
    for (const n of dag.nodes) {
      for (const dep of n.dependencies) {
        const depIdx = idx.get(dep);
        const nodeIdx = idx.get(n.id);
        expect(depIdx).not.toBeUndefined();
        expect(nodeIdx).not.toBeUndefined();
        expect(depIdx!).toBeLessThan(nodeIdx!);
      }
    }
  });
});

describe('dag status state machine (Task 3.1)', () => {
  it('enforces valid transitions and rejects invalid ones', () => {
    const allowed: Array<[from: TaskStatus, to: TaskStatus]> = [
      ['PENDING', 'RUNNING'],
      ['RUNNING', 'DONE'],
      ['RUNNING', 'FAILED'],
      ['RUNNING', 'STALE'],
      ['DONE', 'MERGE_READY'],
      ['MERGE_READY', 'MERGED'],
      ['FAILED', 'PENDING'],
      ['STALE', 'PENDING'],
    ];

    for (const [from, to] of allowed) {
      expect(canTransitionStatus(from, to)).toBe(true);
      expect(() => assertValidStatusTransition(from, to)).not.toThrow();
    }

    const disallowed: Array<[from: TaskStatus, to: TaskStatus]> = [
      ['PENDING', 'DONE'],
      ['DONE', 'MERGED'],
      ['MERGED', 'PENDING'],
      ['FAILED', 'RUNNING'],
      ['RUNNING', 'PENDING'],
      ['PENDING', 'PENDING'],
    ];

    for (const [from, to] of disallowed) {
      expect(canTransitionStatus(from, to)).toBe(false);
      expect(() => assertValidStatusTransition(from, to)).toThrow();
    }
  });
});
