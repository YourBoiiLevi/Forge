import { describe, expect, it } from 'vitest';

import { applyDagOverlays, type DAGOverlay } from '../lib/dag/overlay';
import type { DAG } from '../lib/dag/types';

function makeBaseDag(): DAG {
  return {
    version: 1,
    runId: 'run_test',
    nodes: [
      {
        id: 'task-001',
        type: 'task',
        agentType: 2,
        dependencies: [],
        status: 'PENDING',
      },
      {
        id: 'task-002',
        type: 'task',
        agentType: 2,
        dependencies: [],
        status: 'PENDING',
      },
      {
        id: 'task-003',
        type: 'task',
        agentType: 2,
        dependencies: [],
        status: 'PENDING',
      },
    ],
    metadata: {
      createdAt: new Date('2026-02-10T00:00:00Z').toISOString(),
      createdBy: 'captain',
      totalTasks: 3,
      totalRefineries: 0,
    },
  };
}

describe('dag overlays (Task 3.3)', () => {
  it('applies overlays in appliedAt order (ties broken by crId)', () => {
    const base = makeBaseDag();

    const overlays: DAGOverlay[] = [
      {
        crId: 'cr-002',
        appliedAt: '2026-02-10T00:00:02.000Z',
        addedNodes: [],
        addedEdges: [
          // This edge depends on task-999 existing, so overlay order matters.
          { from: 'task-999', to: 'task-003' },
        ],
      },
      {
        crId: 'cr-001',
        appliedAt: '2026-02-10T00:00:01.000Z',
        addedNodes: [
          {
            id: 'task-999',
            type: 'task',
            agentType: 1,
            dependencies: ['task-001'],
            status: 'PENDING',
          },
        ],
        addedEdges: [],
      },
      {
        // Same appliedAt as cr-002 but lower crId; should apply before cr-002.
        crId: 'cr-001b',
        appliedAt: '2026-02-10T00:00:02.000Z',
        addedNodes: [],
        addedEdges: [{ from: 'task-002', to: 'task-003' }],
      },
    ];

    const effective = applyDagOverlays(base, overlays);
    const node003 = effective.nodes.find((n) => n.id === 'task-003');
    expect(node003).toBeTruthy();
    expect(node003?.dependencies).toEqual(['task-002', 'task-999']);
  });

  it('adds nodes and edges and keeps the resulting graph valid', () => {
    const base = makeBaseDag();
    const overlays: DAGOverlay[] = [
      {
        crId: 'cr-010',
        appliedAt: '2026-02-10T00:00:10.000Z',
        addedNodes: [
          {
            id: 'refinery-001',
            type: 'refinery',
            agentType: 'refinery',
            dependencies: ['task-001'],
            status: 'PENDING',
          },
        ],
        addedEdges: [
          { from: 'refinery-001', to: 'task-003' },
          { from: 'task-002', to: 'refinery-001' },
        ],
      },
    ];

    const effective = applyDagOverlays(base, overlays);
    expect(effective.nodes.some((n) => n.id === 'refinery-001')).toBe(true);

    const refinery = effective.nodes.find((n) => n.id === 'refinery-001');
    expect(refinery?.dependencies).toEqual(['task-001', 'task-002']);

    const node003 = effective.nodes.find((n) => n.id === 'task-003');
    expect(node003?.dependencies).toEqual(['refinery-001']);

    // Metadata totals should reflect appended nodes.
    expect(effective.metadata.totalTasks).toBe(3);
    expect(effective.metadata.totalRefineries).toBe(1);
  });

  it('rejects overlays that try to add a node with an existing id (append-only enforcement)', () => {
    const base = makeBaseDag();
    const overlays: DAGOverlay[] = [
      {
        crId: 'cr-020',
        appliedAt: '2026-02-10T00:00:20.000Z',
        addedNodes: [
          {
            id: 'task-001',
            type: 'task',
            agentType: 1,
            dependencies: [],
            status: 'PENDING',
          },
        ],
        addedEdges: [],
      },
    ];

    expect(() => applyDagOverlays(base, overlays)).toThrow(/DAG_OVERLAY_NODE_ID_CONFLICT/);
  });

  it('rejects overlays that reference missing nodes in edges', () => {
    const base = makeBaseDag();
    const overlays: DAGOverlay[] = [
      {
        crId: 'cr-030',
        appliedAt: '2026-02-10T00:00:30.000Z',
        addedNodes: [],
        addedEdges: [{ from: 'task-nope', to: 'task-003' }],
      },
    ];
    expect(() => applyDagOverlays(base, overlays)).toThrow(/DAG_OVERLAY_UNKNOWN_NODE/);
  });
});
