import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App Routing', () => {
  it('renders dashboard view by default', () => {
    window.history.pushState({}, 'Test page', '/');
    render(<App />);
    expect(screen.getByText('Dashboard View Placeholder')).toBeInTheDocument();
  });

  it('renders captain view on /captain route', () => {
    window.history.pushState({}, 'Test page', '/captain/current');
    render(<App />);
    expect(screen.getByText('Captain Interview View Placeholder')).toBeInTheDocument();
  });

  it('renders artifacts view on /artifacts route', () => {
    window.history.pushState({}, 'Test page', '/artifacts/current');
    render(<App />);
    expect(screen.getByText('Artifacts Browser View Placeholder')).toBeInTheDocument();
  });
});
