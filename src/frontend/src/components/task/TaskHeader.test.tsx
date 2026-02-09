import { render, screen, fireEvent } from '@testing-library/react';
import { TaskHeader } from './TaskHeader';
import { Task } from '../../lib/types';
import { describe, it, expect, vi } from 'vitest';

// Mock StatusLED and Button to avoid testing implementation details of child components
vi.mock('../ui/StatusLED', () => ({
    StatusLED: ({ status }: { status: string }) => <div data-testid="status-led">{status}</div>
}));
vi.mock('../ui/Button', () => ({
    Button: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>
}));

describe('TaskHeader', () => {
    const mockTask: Task = {
        taskId: 'task-123',
        runId: 'run-1',
        title: 'Test Task',
        type: 'test',
        status: 'running',
        dependencies: ['dep-1'],
        createdAt: '',
        updatedAt: '',
    };
    const onBackMock = vi.fn();

    it('renders task details', () => {
        render(<TaskHeader task={mockTask} onBack={onBackMock} />);
        expect(screen.getByText('Test Task')).toBeInTheDocument();
        expect(screen.getByText('ID: task-123')).toBeInTheDocument();
        expect(screen.getByText('test')).toBeInTheDocument(); // CSS transforms to uppercase, but text content is lower
    });

    it('calls onBack when back button clicked', () => {
        render(<TaskHeader task={mockTask} onBack={onBackMock} />);
        const backButton = screen.getByRole('button');
        fireEvent.click(backButton);
        expect(onBackMock).toHaveBeenCalled();
    });

    it('displays dependencies', () => {
        render(<TaskHeader task={mockTask} onBack={onBackMock} />);
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
        expect(screen.getByText('dep-1')).toBeInTheDocument();
    });
});
