import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RefineryView } from '../views/RefineryView';
import { BrowserRouter } from 'react-router-dom';

// Mock child components that are complex or not focus of this test
vi.mock('../components/ActiveAgentsPanel', () => ({
  ActiveAgentsPanel: () => <div data-testid="active-agents-panel">Active Agents</div>
}));

// Mock layout
vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>
}));

describe('RefineryView', () => {
  const renderView = () => {
    return render(
      <BrowserRouter>
        <RefineryView />
      </BrowserRouter>
    );
  };

  it('renders the main refinery layout', () => {
    renderView();
    expect(screen.getByText('Refinery')).toBeInTheDocument();
    expect(screen.getByText('Merge integration and conflict resolution')).toBeInTheDocument();
    expect(screen.getByTestId('active-agents-panel')).toBeInTheDocument();
  });

  it('displays merge status table with branches', () => {
    renderView();
    expect(screen.getByText('Merge Progress')).toBeInTheDocument();
    expect(screen.getByText('task/implement-auth')).toBeInTheDocument();
    expect(screen.getByText('task/fix-ui-bug')).toBeInTheDocument();
  });

  it('shows conflict panel when branch with conflicts is selected', () => {
    renderView();
    // Default selection is conflict branch
    expect(screen.getByText('Merge Conflicts Detected')).toBeInTheDocument();
    expect(screen.getByText('src/routes.ts')).toBeInTheDocument();
  });

  it('switches view when selecting a different branch', () => {
    renderView();
    
    // Click on the second branch (merged status)
    const mergedRow = screen.getByText('task/fix-ui-bug').closest('tr');
    fireEvent.click(mergedRow!);

    // Conflict panel should disappear
    expect(screen.queryByText('Merge Conflicts Detected')).not.toBeInTheDocument();

    // Integration results should appear
    expect(screen.getByText('Integration Results')).toBeInTheDocument();
    expect(screen.getByText('✓ 14 passed')).toBeInTheDocument();
  });

  it('displays change request banner', () => {
    renderView();
    expect(screen.getByText('Change Request Emitted')).toBeInTheDocument();
    expect(screen.getByText(/Update Authentication Flow/)).toBeInTheDocument();
  });
});
