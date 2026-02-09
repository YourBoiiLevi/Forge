import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConflictPanel } from '../components/refinery/ConflictPanel';
import { MOCK_CONFLICTS } from '../components/refinery/types';

describe('ConflictPanel', () => {
  it('does not render when no conflicts', () => {
    const { container } = render(<ConflictPanel conflicts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders list of conflicts', () => {
    render(<ConflictPanel conflicts={MOCK_CONFLICTS} />);
    
    expect(screen.getByText('Merge Conflicts Detected')).toBeInTheDocument();
    expect(screen.getByText('UNRESOLVED')).toBeInTheDocument();
    
    // Check specific conflict items
    expect(screen.getByText('src/routes.ts')).toBeInTheDocument();
    expect(screen.getByText('src/config.ts')).toBeInTheDocument();
  });

  it('shows resolve button only for unresolved conflicts', () => {
    render(<ConflictPanel conflicts={MOCK_CONFLICTS} />);
    
    const resolveButtons = screen.getAllByText('Resolve...');
    // Only one mock conflict is unresolved
    expect(resolveButtons).toHaveLength(1);
  });
});
