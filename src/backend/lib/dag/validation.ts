import type { DAG, DAGNode } from './types';

export type DagValidationIssueCode =
  | 'DAG_DUPLICATE_NODE_ID'
  | 'DAG_UNKNOWN_DEPENDENCY'
  | 'DAG_SELF_DEPENDENCY'
  | 'DAG_EMPTY_REFINERY_DEPENDENCIES'
  | 'DAG_AGENT_TYPE_MISMATCH'
  | 'DAG_METADATA_COUNT_MISMATCH'
  | 'DAG_CYCLE';

export interface DagValidationIssue {
  code: DagValidationIssueCode;
  message: string;
  nodeId?: string;
  dependencyId?: string;
  /** One discovered cycle path, if applicable. */
  cycle?: string[];
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

function findCycle(nodesById: ReadonlyMap<string, DAGNode>): string[] | undefined {
  // Classic DFS with recursion stack.
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string | undefined>();

  function dfs(id: string): string[] | undefined {
    visited.add(id);
    inStack.add(id);

    const node = nodesById.get(id);
    if (!node) return undefined;

    for (const dep of node.dependencies) {
      // Skip dangling refs here; that is validated separately.
      if (!nodesById.has(dep)) continue;
      if (!visited.has(dep)) {
        parent.set(dep, id);
        const found = dfs(dep);
        if (found) return found;
      } else if (inStack.has(dep)) {
        // Found a back-edge: id -> dep. Reconstruct a cycle.
        const cycle: string[] = [dep];
        let cur: string | undefined = id;
        while (cur && cur !== dep) {
          cycle.push(cur);
          cur = parent.get(cur);
        }
        cycle.push(dep);
        cycle.reverse();
        return cycle;
      }
    }

    inStack.delete(id);
    return undefined;
  }

  for (const id of nodesById.keys()) {
    if (!visited.has(id)) {
      parent.set(id, undefined);
      const found = dfs(id);
      if (found) return found;
    }
  }
  return undefined;
}

export function validateDag(dag: DAG): DagValidationIssue[] {
  const issues: DagValidationIssue[] = [];

  const nodesById = new Map<string, DAGNode>();
  for (const n of dag.nodes) {
    if (nodesById.has(n.id)) {
      issues.push({
        code: 'DAG_DUPLICATE_NODE_ID',
        message: `Duplicate node id: ${n.id}`,
        nodeId: n.id,
      });
      continue;
    }
    nodesById.set(n.id, n);
  }

  for (const n of dag.nodes) {
    // Validate type/agentType consistency.
    if (n.type === 'refinery') {
      if (n.agentType !== 'refinery') {
        issues.push({
          code: 'DAG_AGENT_TYPE_MISMATCH',
          message: `Refinery node ${n.id} must have agentType "refinery"`,
          nodeId: n.id,
        });
      }
      if (n.dependencies.length === 0) {
        issues.push({
          code: 'DAG_EMPTY_REFINERY_DEPENDENCIES',
          message: `Refinery node ${n.id} must have at least one dependency`,
          nodeId: n.id,
        });
      }
    } else {
      if (n.agentType === 'refinery') {
        issues.push({
          code: 'DAG_AGENT_TYPE_MISMATCH',
          message: `Task node ${n.id} must have agentType 1, 2, or 3`,
          nodeId: n.id,
        });
      }
    }

    for (const dep of n.dependencies) {
      if (dep === n.id) {
        issues.push({
          code: 'DAG_SELF_DEPENDENCY',
          message: `Node ${n.id} cannot depend on itself`,
          nodeId: n.id,
          dependencyId: dep,
        });
        continue;
      }
      if (!nodesById.has(dep)) {
        issues.push({
          code: 'DAG_UNKNOWN_DEPENDENCY',
          message: `Node ${n.id} depends on missing node ${dep}`,
          nodeId: n.id,
          dependencyId: dep,
        });
      }
    }
  }

  // Validate metadata counts.
  const expected = computeCounts(dag.nodes);
  if (dag.metadata.totalTasks !== expected.totalTasks || dag.metadata.totalRefineries !== expected.totalRefineries) {
    issues.push({
      code: 'DAG_METADATA_COUNT_MISMATCH',
      message: `DAG metadata totals do not match nodes (expected tasks=${expected.totalTasks}, refineries=${expected.totalRefineries})`,
    });
  }

  // Cycle detection (only meaningful once dangling references are resolved).
  if (!issues.some((i) => i.code === 'DAG_UNKNOWN_DEPENDENCY') && !issues.some((i) => i.code === 'DAG_DUPLICATE_NODE_ID')) {
    const cycle = findCycle(nodesById);
    if (cycle) {
      issues.push({
        code: 'DAG_CYCLE',
        message: 'DAG contains a cycle',
        cycle,
      });
    }
  }

  return issues;
}

/**
 * Returns a topological ordering of node IDs.
 *
 * Throws if the DAG contains dangling references or cycles.
 */
export function topologicalSort(dag: DAG): string[] {
  const issues = validateDag(dag);
  const fatal = issues.find(
    (i) =>
      i.code === 'DAG_UNKNOWN_DEPENDENCY' ||
      i.code === 'DAG_DUPLICATE_NODE_ID' ||
      i.code === 'DAG_CYCLE',
  );
  if (fatal) {
    const extra = fatal.cycle ? `: ${fatal.cycle.join(' -> ')}` : '';
    throw new Error(`${fatal.code}${extra}`);
  }

  const nodesById = new Map<string, DAGNode>(dag.nodes.map((n) => [n.id, n] as const));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const n of dag.nodes) {
    indegree.set(n.id, 0);
    outgoing.set(n.id, []);
  }

  for (const n of dag.nodes) {
    for (const dep of n.dependencies) {
      // dep -> n
      outgoing.get(dep)?.push(n.id);
      indegree.set(n.id, (indegree.get(n.id) ?? 0) + 1);
    }
  }

  // Stable queue initialization: preserve original node order.
  const queue: string[] = [];
  for (const n of dag.nodes) {
    if ((indegree.get(n.id) ?? 0) === 0) queue.push(n.id);
  }

  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    ordered.push(id);
    for (const to of outgoing.get(id) ?? []) {
      const next = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, next);
      if (next === 0) queue.push(to);
    }
  }

  if (ordered.length !== dag.nodes.length) {
    // Should not happen because validateDag already checked cycles, but keep as a guard.
    const cycle = findCycle(nodesById);
    throw new Error(`DAG_CYCLE${cycle ? `: ${cycle.join(' -> ')}` : ''}`);
  }

  return ordered;
}
