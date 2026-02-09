import dagre from 'dagre';
import { Node, Edge, Position } from '@xyflow/react';

// Use strict DAG types from specs
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'merged' | 'stale';

export interface DAGNodeData extends Record<string, unknown> {
  label: string;
  status: TaskStatus;
  type: string;
  id: string; // Task ID
}

export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 80;

/**
 * Lays out the DAG using dagre
 */
export const getLayoutedElements = (
  nodes: Node<DAGNodeData>[],
  edges: Edge[],
  direction = 'LR'
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export const getStatusColor = (status: TaskStatus): string => {
  switch (status) {
    case 'running': return 'var(--accent)';
    case 'done': return 'var(--success)';
    case 'failed': return 'var(--error)';
    case 'merged': return 'rgba(0, 255, 65, 0.5)'; // --success at 50%
    case 'stale': return 'var(--warning)';
    case 'pending':
    default: return 'var(--text-secondary)';
  }
};
