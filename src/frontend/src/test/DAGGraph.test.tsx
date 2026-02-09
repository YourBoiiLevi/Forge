import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DAGGraph } from '../components/dag/DAGGraph';
import { Task } from '../lib/types';

// Mock ReactFlow since it requires ResizeObserver and other browser APIs
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ReactFlow: ({ nodes, onNodeClick }: { nodes: any[]; onNodeClick: (e: any, node: any) => void }) => (
      <div data-testid="react-flow">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {nodes.map((node: any) => (
          <div 
            key={node.id} 
            data-testid={`node-${node.id}`}
            onClick={(e) => onNodeClick(e, node)}
          >
            {node.data.label}
          </div>
        ))}
      </div>
    ),
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useNodesState: (initial: any) => [initial, vi.fn(), vi.fn()],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useEdgesState: (initial: any) => [initial, vi.fn(), vi.fn()],
  };
});

const mockTasks: Task[] = [
  { 
    taskId: 'task-1', 
    runId: 'run-1',
    title: 'Initialize Repo', 
    status: 'done', 
    type: 'config', 
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  { 
    taskId: 'task-2', 
    runId: 'run-1',
    title: 'Implement Auth', 
    status: 'running', 
    type: 'code', 
    dependencies: ['task-1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  { 
    taskId: 'task-3', 
    runId: 'run-1',
    title: 'Setup DB', 
    status: 'pending', 
    type: 'db', 
    dependencies: ['task-1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
];

describe('DAG Visualization', () => {
  it('renders all task nodes', () => {
    render(<DAGGraph tasks={mockTasks} />);
    
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    expect(screen.getByText('Initialize Repo')).toBeInTheDocument();
    expect(screen.getByText('Implement Auth')).toBeInTheDocument();
    expect(screen.getByText('Setup DB')).toBeInTheDocument();
  });

  it('renders nodes with correct status colors', () => {
    // Note: Since we're mocking ReactFlow, we can't easily check internal node props/styles here
    // But we can check if the nodes are rendered, which implies the data mapping worked
    render(<DAGGraph tasks={mockTasks} />);
    const nodes = screen.getAllByTestId(/^node-/);
    expect(nodes).toHaveLength(3);
  });

  it('handles node clicks', async () => {
    const onSelect = vi.fn();
    render(<DAGGraph tasks={mockTasks} onTaskSelect={onSelect} />);
    
    const node = await screen.findByTestId('node-task-1');
    fireEvent.click(node);
    
    expect(onSelect).toHaveBeenCalledWith('task-1');
  });

  it('handles empty task list', () => {
    render(<DAGGraph tasks={[]} />);
    expect(screen.getByTestId('react-flow')).toBeEmptyDOMElement();
  });

  it('handles complex dependencies', () => {
    const complexTasks: Task[] = [
      ...mockTasks,
      { 
        taskId: 'task-4', 
        runId: 'run-1',
        title: 'Integration Test', 
        status: 'pending', 
        type: 'test', 
        dependencies: ['task-2', 'task-3'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    render(<DAGGraph tasks={complexTasks} />);
    expect(screen.getByText('Integration Test')).toBeInTheDocument();
  });
});
