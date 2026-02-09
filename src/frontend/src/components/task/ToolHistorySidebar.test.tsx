import { render, screen, fireEvent } from '@testing-library/react';
import { ToolHistorySidebar, ToolCall } from './ToolHistorySidebar';
import { describe, it, expect } from 'vitest';

describe('ToolHistorySidebar', () => {
    const mockCalls: ToolCall[] = [
        { id: '1', tool: 'read_file', args: { path: 'test.ts' }, timestamp: new Date().toISOString() },
        { id: '2', tool: 'run_cmd', args: { cmd: 'ls' }, error: 'Command failed', timestamp: new Date().toISOString() },
    ];

    it('renders no tools message when empty', () => {
        render(<ToolHistorySidebar toolCalls={[]} />);
        expect(screen.getByText('No tools called yet')).toBeInTheDocument();
    });

    it('renders tool calls in list', () => {
        render(<ToolHistorySidebar toolCalls={mockCalls} />);
        expect(screen.getByText('read_file')).toBeInTheDocument();
        expect(screen.getByText('run_cmd')).toBeInTheDocument();
    });

    it('expands tool details on click', () => {
        render(<ToolHistorySidebar toolCalls={mockCalls} />);
        const button = screen.getByText('read_file');
        fireEvent.click(button);
        
        // Check if arguments are visible
        expect(screen.getByText('Arguments')).toBeInTheDocument();
        expect(screen.getByText(/"path": "test.ts"/)).toBeInTheDocument();
    });

    it('highlights error calls', () => {
        render(<ToolHistorySidebar toolCalls={mockCalls} />);
        const errorItem = screen.getByText('run_cmd').closest('div');
        expect(errorItem?.className).toContain('border-error/50'); // Check parent container border
    });

    it('displays error details when expanded', () => {
        render(<ToolHistorySidebar toolCalls={mockCalls} />);
        const button = screen.getByText('run_cmd');
        fireEvent.click(button);
        expect(screen.getByText('Error')).toBeInTheDocument();
        expect(screen.getByText('Command failed')).toBeInTheDocument();
    });
});
