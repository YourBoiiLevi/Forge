import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusLED, StatusType } from './StatusLED';

describe('StatusLED', () => {
  const statuses: StatusType[] = ['pending', 'running', 'done', 'failed', 'merged', 'stale'];

  statuses.forEach((status) => {
    it(`renders correctly for ${status} status`, () => {
      render(<StatusLED status={status} />);
      const indicator = screen.getByRole('status').querySelector('div');
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute('aria-label', `Status: ${status}`);
    });
  });

  it('renders label when showLabel is true', () => {
    render(<StatusLED status="running" showLabel />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('does not render label when showLabel is false', () => {
    render(<StatusLED status="running" />);
    expect(screen.queryByText('running')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<StatusLED status="pending" className="custom-class" />);
    const container = screen.getByRole('status');
    expect(container).toHaveClass('custom-class');
  });

  it('has pulse animation for running status', () => {
    render(<StatusLED status="running" />);
    const indicator = screen.getByRole('status').querySelector('div');
    expect(indicator).toHaveClass('animate-pulse');
  });
});
