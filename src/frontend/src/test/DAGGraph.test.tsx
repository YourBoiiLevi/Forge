import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DAGGraph } from '../components/dag/DAGGraph';
import { getStatusColor } from '../lib/dag-utils';

// Mock ResizeObserver for React Flow
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

// Mock React Flow to avoid canvas rendering issues in tests
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ nodes, onNodeClick, nodeTypes }: { nodes: Array<{ id: string; type: string; data: unknown }>; onNodeClick: (e: React.MouseEvent, n: unknown) => void; nodeTypes: Record<string, React.ComponentType<{ data: unknown }>> }) => (
      <div data-testid="react-flow">
        {nodes.map((node) => {
          const NodeComponent = nodeTypes[node.type];
          return (
            <div 
              key={node.id} 
              onClick={(e) => onNodeClick(e, node)}
              data-testid={`node-${node.id}`}
            >
              <NodeComponent data={node.data} />
            </div>
          );
        })}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    Handle: () => <div />, // Mock Handle to avoid Context usage
  };
});

describe('DAG Visualization', () => {
  const mockTasks = [
    {
      id: 'task-1',
      title: 'Initialize Repo',
      status: 'done',
      type: 'config',
      dependencies: []
    },
    {
      id: 'task-2',
      title: 'Implement Auth',
      status: 'running',
      type: 'code',
      dependencies: ['task-1']
    },
    {
      id: 'task-3',
      title: 'Setup Database',
      status: 'pending',
      type: 'db',
      dependencies: ['task-1']
    }
  ];

  it('renders all task nodes', () => {
    render(<DAGGraph tasks={mockTasks} />);
    
    expect(screen.getByText('Initialize Repo')).toBeInTheDocument();
    expect(screen.getByText('Implement Auth')).toBeInTheDocument();
    expect(screen.getByText('Setup Database')).toBeInTheDocument();
  });

  it('renders nodes with correct status styles', () => {
    render(<DAGGraph tasks={mockTasks} />);
    
    const runningNode = screen.getByLabelText('Task Implement Auth, status running');
    expect(runningNode).toHaveClass('animate-pulse-border');
  });

  it('handles node clicks', () => {
    const onSelect = vi.fn();
    render(<DAGGraph tasks={mockTasks} onTaskSelect={onSelect} />);
    
    const node = screen.getByTestId('node-task-1');
    fireEvent.click(node);
    
    expect(onSelect).toHaveBeenCalledWith('task-1');
  });

  it('updates layout when tasks change', () => {
    const { rerender } = render(<DAGGraph tasks={mockTasks} />);
    
    const newTasks = [
      ...mockTasks,
      {
        id: 'task-4',
        title: 'New Task',
        status: 'pending',
        type: 'test',
        dependencies: ['task-2']
      }
    ];

    rerender(<DAGGraph tasks={newTasks} />);
    expect(screen.getByText('New Task')).toBeInTheDocument();
  });
});

describe('DAG Utilities', () => {
  it('returns correct colors for statuses', () => {
    expect(getStatusColor('running')).toBe('var(--accent)');
    expect(getStatusColor('done')).toBe('var(--success)');
    expect(getStatusColor('failed')).toBe('var(--error)');
    expect(getStatusColor('merged')).toBe('rgba(0, 255, 65, 0.5)');
    expect(getStatusColor('pending')).toBe('var(--text-secondary)');
  });
});
