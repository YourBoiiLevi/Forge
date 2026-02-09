import React from 'react';
import { cn } from '../../lib/utils';

export type Status = 'pending' | 'running' | 'done' | 'failed' | 'merged' | 'stale';

interface StatusLEDProps {
  status: Status;
  className?: string;
  showLabel?: boolean;
}

const statusColors: Record<Status, string> = {
  pending: 'bg-text-secondary',
  running: 'bg-accent animate-pulse-led shadow-[0_0_8px_rgba(255,107,0,0.5)]',
  done: 'bg-success',
  failed: 'bg-error',
  merged: 'bg-success/50', // Dim green
  stale: 'bg-warning',
};

const statusLabels: Record<Status, string> = {
  pending: 'PENDING',
  running: 'RUNNING',
  done: 'DONE',
  failed: 'FAILED',
  merged: 'MERGED',
  stale: 'STALE',
};

export const StatusLED: React.FC<StatusLEDProps> = ({ status, className, showLabel = false }) => {
  return (
    <div className={cn("flex items-center gap-2", className)} role="status" aria-label={`Status: ${status}`}>
      <div 
        className={cn(
          "w-1.5 h-1.5 rounded-full", // 6px = 1.5 tailwind units
          statusColors[status]
        )}
      />
      {showLabel && (
        <span className="text-xs font-mono text-text-secondary uppercase tracking-wider">
          {statusLabels[status]}
        </span>
      )}
    </div>
  );
};
