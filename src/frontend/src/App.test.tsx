import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock DAGGraph to avoid React Flow rendering issues in tests
vi.mock('./components/dag/DAGGraph', () => ({
  DAGGraph: () => <div data-testid="mock-dag-graph">DAG Graph</div>
}));

describe('App Routing', () => {
  it('renders dashboard view by default', () => {
    window.history.pushState({}, 'Test page', '/');
    render(<App />);
    expect(screen.getByText('Dependency Graph')).toBeInTheDocument();
  });

  it('renders captain view on /captain route', () => {
    window.history.pushState({}, 'Test page', '/captain/current');
    render(<App />);
    expect(screen.getByText('Captain Interface')).toBeInTheDocument();
  });

  it('renders artifacts view on /artifacts route', () => {
    window.history.pushState({}, 'Test page', '/artifacts/current');
    render(<App />);
    expect(screen.getByText('Artifacts Browser View Placeholder')).toBeInTheDocument();
  });
});
