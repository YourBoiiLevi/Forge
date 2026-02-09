import { cn } from '../../lib/utils';

export type StatusType = 'pending' | 'running' | 'done' | 'failed' | 'merged' | 'stale';

export interface StatusLEDProps {
  status: StatusType;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusColors: Record<StatusType, string> = {
  pending: 'bg-zinc-600',
  running: 'bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]',
  done: 'bg-green-500',
  failed: 'bg-red-500',
  merged: 'bg-emerald-700',
  stale: 'bg-amber-600',
};

const sizeClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

export function StatusLED({ status, className, showLabel = false, size = 'md' }: StatusLEDProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="status">
      <div 
        className={cn(
          sizeClasses[size],
          "rounded-full transition-all duration-300", 
          statusColors[status]
        )}
        aria-label={`Status: ${status}`}
      />
      {showLabel && <span className="text-xs uppercase text-zinc-500 font-mono">{status}</span>}
    </div>
  );
}
