import type { DAG, DAGNode } from './types';
import { validateDag } from './validation';

export interface DAGOverlayEdge {
  from: string;
  to: string;
}

/**
 * Append-only DAG overlay applied on top of a base DAG.
 *
 * Spec: specs/07-task-dag.md §8 and specs/08-artifact-schemas.md §5.
 */
export interface DAGOverlay {
  crId: string;
  appliedAt: string;
  addedNodes: DAGNode[];
  addedEdges: DAGOverlayEdge[];
}

function assertNonEmptyTrimmedString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`DAG_OVERLAY_INVALID: ${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) {
    throw new Error(`DAG_OVERLAY_INVALID: ${label} must be a non-empty trimmed string`);
  }
  return trimmed;
}

function parseIsoMs(value: string, label: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`DAG_OVERLAY_INVALID: ${label} must be an ISO 8601 timestamp`);
  }
  return ms;
}

function cloneNode(n: DAGNode): DAGNode {
  return {
    ...n,
    dependencies: [...n.dependencies],
    metadata: n.metadata ? { ...n.metadata } : undefined,
  };
}

function computeCounts(nodes: DAGNode[]): { totalTasks: number; totalRefineries: number } {
  let totalTasks = 0;
  let totalRefineries = 0;
  for (const n of nodes) {
    if (n.type === 'task') totalTasks += 1;
    else totalRefineries += 1;
  }
  return { totalTasks, totalRefineries };
}

function validateOverlayShape(overlay: DAGOverlay): { crId: string; appliedAtMs: number } {
  const crId = assertNonEmptyTrimmedString(overlay.crId, 'crId');
  const appliedAt = assertNonEmptyTrimmedString(overlay.appliedAt, 'appliedAt');
  const appliedAtMs = parseIsoMs(appliedAt, 'appliedAt');

  if (!Array.isArray(overlay.addedNodes)) {
    throw new Error('DAG_OVERLAY_INVALID: addedNodes must be an array');
  }
  if (!Array.isArray(overlay.addedEdges)) {
    throw new Error('DAG_OVERLAY_INVALID: addedEdges must be an array');
  }

  for (const e of overlay.addedEdges) {
    const edge = e as unknown as Record<string, unknown>;
    assertNonEmptyTrimmedString(edge.from, 'addedEdges[].from');
    assertNonEmptyTrimmedString(edge.to, 'addedEdges[].to');
  }

  return { crId, appliedAtMs };
}

/**
 * Applies append-only overlays to a base DAG and returns the effective DAG.
 *
 * Semantics:
 * - Overlays are applied in ascending `appliedAt` order (ties broken by `crId`).
 * - `addedNodes` append new nodes; node IDs must not already exist.
 * - `addedEdges` add `from` to the dependency list of `to` (deduplicated).
 * - The merged graph must remain a valid DAG.
 */
export function applyDagOverlays(baseDag: DAG, overlays: readonly DAGOverlay[]): DAG {
  // Clone the base DAG so callers cannot accidentally mutate persisted state.
  const effective: DAG = {
    ...baseDag,
    nodes: baseDag.nodes.map(cloneNode),
    metadata: { ...baseDag.metadata },
  };

  const nodesById = new Map<string, DAGNode>(effective.nodes.map((n) => [n.id, n] as const));
  const appliedCrIds = new Set<string>();

  const normalized = overlays
    .map((o) => ({ overlay: o, ...validateOverlayShape(o) }))
    .sort((a, b) => a.appliedAtMs - b.appliedAtMs || a.crId.localeCompare(b.crId));

  for (const { overlay, crId } of normalized) {
    // Idempotency: apply each CR overlay at most once.
    if (appliedCrIds.has(crId)) continue;
    appliedCrIds.add(crId);

    // 1) Append nodes.
    for (const raw of overlay.addedNodes) {
      const node = cloneNode(raw);
      if (nodesById.has(node.id)) {
        throw new Error(`DAG_OVERLAY_NODE_ID_CONFLICT: node ${node.id} already exists`);
      }
      effective.nodes.push(node);
      nodesById.set(node.id, node);
    }

    // 2) Add edges (dependencies).
    for (const e of overlay.addedEdges) {
      const from = assertNonEmptyTrimmedString(e.from, 'addedEdges[].from');
      const to = assertNonEmptyTrimmedString(e.to, 'addedEdges[].to');

      if (!nodesById.has(from)) {
        throw new Error(`DAG_OVERLAY_UNKNOWN_NODE: edge.from references missing node ${from}`);
      }

      const target = nodesById.get(to);
      if (!target) {
        throw new Error(`DAG_OVERLAY_UNKNOWN_NODE: edge.to references missing node ${to}`);
      }

      // Append-only semantics: only add dependencies, never remove or rewrite.
      if (!target.dependencies.includes(from)) {
        target.dependencies.push(from);
      }
    }
  }

  // Ensure metadata counts match the new node set (the base DAG is immutable, but the effective view isn't).
  const counts = computeCounts(effective.nodes);
  effective.metadata = {
    ...effective.metadata,
    totalTasks: counts.totalTasks,
    totalRefineries: counts.totalRefineries,
  };

  const issues = validateDag(effective);
  const fatal = issues.find(
    (i) => i.code === 'DAG_DUPLICATE_NODE_ID' || i.code === 'DAG_UNKNOWN_DEPENDENCY' || i.code === 'DAG_CYCLE',
  );
  if (fatal) {
    const extra = fatal.cycle ? `: ${fatal.cycle.join(' -> ')}` : '';
    throw new Error(`DAG_OVERLAY_INVALID_DAG: ${fatal.code}${extra}`);
  }

  return effective;
}
