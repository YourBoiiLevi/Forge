import { cn } from '../../lib/utils';

export type StatusType = 'pending' | 'running' | 'done' | 'failed' | 'merged' | 'stale';

interface StatusLEDProps {
  status: StatusType;
  className?: string;
  showLabel?: boolean;
}

const statusColors: Record<StatusType, string> = {
  pending: 'bg-zinc-600',
  running: 'bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]',
  done: 'bg-green-500',
  failed: 'bg-red-500',
  merged: 'bg-emerald-700',
  stale: 'bg-amber-600',
};

export function StatusLED({ status, className, showLabel = false }: StatusLEDProps) {
  return (
    <div className="flex items-center gap-2" role="status">
      <div 
        className={cn(
          "w-1.5 h-1.5 rounded-full transition-all duration-300", 
          statusColors[status],
          className
        )}
        aria-label={status}
      />
      {showLabel && <span className="text-xs uppercase text-zinc-500">{status}</span>}
    </div>
  );
}
