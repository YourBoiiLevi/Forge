import React, { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Edge,
  Node,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TaskNode } from './TaskNode';
import { getLayoutedElements, DAGNodeData } from '../../lib/dag-utils';

interface DAGGraphProps {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    dependencies: string[];
  }>;
  onTaskSelect?: (taskId: string) => void;
  className?: string;
}

const nodeTypes = {
  task: TaskNode,
};

export const DAGGraph: React.FC<DAGGraphProps> = ({ tasks, onTaskSelect, className }) => {
  // Convert tasks to React Flow nodes and edges
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node<DAGNodeData>[] = tasks.map((task) => ({
      id: task.id,
      type: 'task',
      data: {
        id: task.id,
        label: task.title,
        status: task.status as DAGNodeData['status'],
        type: task.type,
      },
      position: { x: 0, y: 0 }, // Will be set by layout
    }));

    const edges: Edge[] = tasks.flatMap((task) =>
      task.dependencies.map((depId) => ({
        id: `${depId}-${task.id}`,
        source: depId,
        target: task.id,
        type: 'default',
        animated: false,
        style: { stroke: 'var(--border)', strokeWidth: 1 },
      }))
    );

    return getLayoutedElements(nodes, edges);
  }, [tasks]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update layout when tasks change
  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onTaskSelect?.(node.id);
    },
    [onTaskSelect]
  );

  return (
    <div className={`w-full h-full min-h-[400px] bg-primary ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 1, stroke: 'var(--border)' },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2A2A2A" gap={20} size={1} />
        <Controls 
          className="!bg-surface !border-border !fill-text-primary [&>button]:!border-border [&>button]:!bg-surface [&>button:hover]:!bg-border" 
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
};
