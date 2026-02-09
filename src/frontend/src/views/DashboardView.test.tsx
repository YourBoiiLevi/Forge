import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DashboardView } from './DashboardView';
import { describe, it, expect, vi } from 'vitest';

// Mock DAGGraph since it uses specialized libraries that might be hard to test in jsdom
vi.mock('../components/dag/DAGGraph', () => ({
  DAGGraph: () => <div data-testid="mock-dag-graph">DAG Graph</div>
}));

describe('DashboardView', () => {
  it('renders all main sections', () => {
    render(
      <BrowserRouter>
        <DashboardView />
      </BrowserRouter>
    );

    // Check for main sections
    expect(screen.getByTestId('mock-dag-graph')).toBeInTheDocument();
    expect(screen.getByText(/Dependency Graph/i)).toBeInTheDocument();
    
    // Check Task List
    expect(screen.getAllByText(/Initialize Project/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Setup Database Schema/i).length).toBeGreaterThan(0);
    
    // Check Active Agents Panel
    expect(screen.getByText(/Active Agents/i)).toBeInTheDocument();
    // "RUNNING" appears in TopBar and Agents Panel. Just ensure it's visible.
    expect(screen.getAllByText(/RUNNING/i).length).toBeGreaterThan(0);
    
    // Check Events Feed
    expect(screen.getByText(/Events Feed/i)).toBeInTheDocument();
    // Use getAllByText because "Initialize Project" might appear in both task list and events
    expect(screen.getAllByText(/Initialize Project/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Setup Database Schema/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Starting implementation of Auth API/i)).toBeInTheDocument();
  });

  it('displays correct number of running tasks in agents panel', () => {
    render(
      <BrowserRouter>
        <DashboardView />
      </BrowserRouter>
    );
    
    // Based on MOCK_TASKS in DashboardView, there is 1 running task
    const runningBadge = screen.getByText(/1 RUNNING/i);
    expect(runningBadge).toBeInTheDocument();
  });
});
