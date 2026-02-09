import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CaptainChat } from './CaptainChat';
import { forgeClient } from '../../lib/api';

// Mock the API client
vi.mock('../../lib/api', () => ({
  forgeClient: {
    sendCaptainMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('CaptainChat', () => {
  it('renders empty state initially', () => {
    render(<CaptainChat runId="test-run" />);
    expect(screen.getByText('Captain Interface')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Message the Captain...')).toBeInTheDocument();
  });

  it('renders initial messages if provided', () => {
    const initialMessages = [
      {
        id: '1',
        role: 'captain' as const,
        content: 'Hello captain',
        timestamp: new Date().toISOString(),
      },
    ];
    render(<CaptainChat runId="test-run" initialMessages={initialMessages} />);
    expect(screen.getByText('Hello captain')).toBeInTheDocument();
  });

  it('sends a message and shows user message immediately', async () => {
    render(<CaptainChat runId="test-run" />);
    
    const input = screen.getByPlaceholderText('Message the Captain...');
    fireEvent.change(input, { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByText('Send'));

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(forgeClient.sendCaptainMessage).toHaveBeenCalledWith('test-run', 'Hello world');
  });

  it('disables input while thinking', async () => {
    render(<CaptainChat runId="test-run" />);
    
    const input = screen.getByPlaceholderText('Message the Captain...');
    fireEvent.change(input, { target: { value: 'Make a plan' } });
    fireEvent.click(screen.getByText('Send'));

    expect(screen.getByText('Captain is thinking...')).toBeInTheDocument();
    expect(input).toBeDisabled();
  });
  
  it('shows plan review when triggered', async () => {
    // This relies on the internal mock logic in CaptainChat for now
    render(<CaptainChat runId="test-run" />);
    
    const input = screen.getByPlaceholderText('Message the Captain...');
    fireEvent.change(input, { target: { value: 'Create a plan for me' } });
    fireEvent.click(screen.getByText('Send'));
    
    // Wait for the mock timeout
    await waitFor(() => {
        expect(screen.getByText('Plan Finalized')).toBeInTheDocument();
    }, { timeout: 2000 });
    
    expect(screen.getByText('Approve & Execute')).toBeInTheDocument();
  });
});
