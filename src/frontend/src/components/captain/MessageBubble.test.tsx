import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MessageBubble } from './MessageBubble';

describe('MessageBubble', () => {
  it('renders user message correctly', () => {
    render(
      <MessageBubble
        role="user"
        content="Hello there"
        timestamp={new Date().toISOString()}
      />
    );
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.queryByText('Captain')).not.toBeInTheDocument();
  });

  it('renders captain message correctly', () => {
    render(
      <MessageBubble
        role="captain"
        content="Aye aye"
        timestamp={new Date().toISOString()}
      />
    );
    expect(screen.getByText('Captain')).toBeInTheDocument();
    expect(screen.getByText('Aye aye')).toBeInTheDocument();
  });

  it('shows typing indicator when streaming', () => {
    const { container } = render(
      <MessageBubble
        role="captain"
        content="Streaming..."
        timestamp={new Date().toISOString()}
        isStreaming={true}
      />
    );
    // Use a class check or simply verify no error
    // The implementation adds an animate-pulse span
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders artifacts if present', () => {
    render(
      <MessageBubble
        role="captain"
        content="Created specs"
        timestamp={new Date().toISOString()}
        artifacts={[
          { id: '1', path: 'specs/test.md', type: 'spec' }
        ]}
      />
    );
    expect(screen.getByText('Artifacts Created')).toBeInTheDocument();
    expect(screen.getByText('specs/test.md')).toBeInTheDocument();
  });
});
