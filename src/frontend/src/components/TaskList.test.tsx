import { render, screen, fireEvent } from '@testing-library/react';
import { TaskList } from './TaskList';
import { Task } from '../lib/types';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

const mockTasks: Task[] = [
  {
    taskId: 'task-1',
    runId: 'run-1',
    title: 'Initialize Project',
    type: 'setup',
    status: 'done',
    agentId: 'captain',
    dependencies: [],
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:05:00Z'
  },
  {
    taskId: 'task-2',
    runId: 'run-1',
    title: 'Implement Core Feature',
    type: 'code',
    status: 'running',
    agentId: 'developer',
    dependencies: ['task-1'],
    createdAt: '2024-01-01T10:10:00Z',
    updatedAt: '2024-01-01T10:15:00Z'
  },
  {
    taskId: 'task-3',
    runId: 'run-1',
    title: 'Write Tests',
    type: 'test',
    status: 'pending',
    dependencies: ['task-2'],
    createdAt: '2024-01-01T10:20:00Z',
    updatedAt: '2024-01-01T10:20:00Z'
  }
];

describe('TaskList', () => {
  interface ComponentProps {
    tasks?: Task[];
    onTaskClick?: (taskId: string) => void;
  }

  const renderComponent = (props: ComponentProps = {}) => {
    return render(
      <BrowserRouter>
        <TaskList tasks={mockTasks} {...props} />
      </BrowserRouter>
    );
  };

  it('renders all tasks', () => {
    renderComponent();
    expect(screen.getByText('Initialize Project')).toBeInTheDocument();
    expect(screen.getByText('Implement Core Feature')).toBeInTheDocument();
    expect(screen.getByText('Write Tests')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 3 tasks')).toBeInTheDocument();
  });

  it('filters by status', () => {
    renderComponent();
    
    const filterSelect = screen.getByLabelText(/filter status/i);
    fireEvent.change(filterSelect, { target: { value: 'done' } });

    expect(screen.getByText('Initialize Project')).toBeInTheDocument();
    expect(screen.queryByText('Implement Core Feature')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 3 tasks')).toBeInTheDocument();
  });

  it('filters by search query', () => {
    renderComponent();
    
    const searchInput = screen.getByLabelText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Core' } });

    expect(screen.getByText('Implement Core Feature')).toBeInTheDocument();
    expect(screen.queryByText('Initialize Project')).not.toBeInTheDocument();
  });

  it('sorts columns', () => {
    renderComponent();
    
    // Default sort is taskId ASC (task-1, task-2, task-3)
    const rows = screen.getAllByRole('row').slice(1); // Skip header
    expect(rows[0]).toHaveTextContent('Initialize Project');
    
    // Sort by Title DESC
    const titleHeader = screen.getByText('Title');
    fireEvent.click(titleHeader); // ASC
    fireEvent.click(titleHeader); // DESC

    const sortedRows = screen.getAllByRole('row').slice(1);
    // Write Tests (W) > Initialize (I) > Implement (I)
    expect(sortedRows[0]).toHaveTextContent('Write Tests');
  });

  it('handles row click', () => {
    const onTaskClick = vi.fn();
    renderComponent({ onTaskClick });

    fireEvent.click(screen.getByText('Initialize Project'));
    expect(onTaskClick).toHaveBeenCalledWith('task-1');
  });

  it('clears filters', () => {
    renderComponent();
    
    const filterSelect = screen.getByLabelText(/filter status/i);
    fireEvent.change(filterSelect, { target: { value: 'failed' } }); // No failed tasks
    
    expect(screen.getByText(/No tasks found/i)).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Clear Filters'));
    
    expect(screen.getByText('Initialize Project')).toBeInTheDocument();
  });
});
