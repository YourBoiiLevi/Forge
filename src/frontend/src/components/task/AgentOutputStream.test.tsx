import { render, screen, fireEvent } from '@testing-library/react';
import { AgentOutputStream } from './AgentOutputStream';
import { AgentLogData } from '../../lib/types';
import { describe, it, expect, vi } from 'vitest';

describe('AgentOutputStream', () => {
    const mockLogs: AgentLogData[] = [
        { taskId: '1', agentId: 'agent-1', level: 'info', message: 'Starting task' },
        { taskId: '1', agentId: 'agent-1', level: 'debug', message: 'Debugging' },
    ];

    it('renders waiting message when logs are empty', () => {
        render(<AgentOutputStream logs={[]} />);
        expect(screen.getByText('Waiting for agent output...')).toBeInTheDocument();
    });

    it('renders logs correctly', () => {
        render(<AgentOutputStream logs={mockLogs} />);
        expect(screen.getByText('Starting task')).toBeInTheDocument();
        expect(screen.getByText('Debugging')).toBeInTheDocument();
    });

    it('applies correct styling based on log level', () => {
        const errorLog: AgentLogData[] = [
            { taskId: '1', agentId: 'agent-1', level: 'error', message: 'Critical Failure' }
        ];
        render(<AgentOutputStream logs={errorLog} />);
        const logElement = screen.getByText('Critical Failure');
        expect(logElement.className).toContain('text-error');
    });

    it('shows streaming cursor when isStreaming is true', () => {
        render(<AgentOutputStream logs={mockLogs} isStreaming={true} />);
        expect(screen.getByText('_')).toBeInTheDocument();
    });
});
