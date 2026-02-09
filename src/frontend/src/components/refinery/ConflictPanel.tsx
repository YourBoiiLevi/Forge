import { Conflict } from './types';

interface ConflictPanelProps {
  conflicts: Conflict[];
}

export function ConflictPanel({ conflicts }: ConflictPanelProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="border border-error bg-error/5 mt-4">
      <div className="px-4 py-3 border-b border-error/20 flex justify-between items-center bg-error/10">
        <h3 className="font-pixel text-error text-sm uppercase flex items-center gap-2">
          <span className="text-lg">⚠</span> Merge Conflicts Detected
        </h3>
        <span className="font-mono text-xs text-error font-bold">
          {conflicts.length} UNRESOLVED
        </span>
      </div>
      
      <div className="divide-y divide-error/10">
        {conflicts.map((conflict, index) => (
          <div key={index} className="px-4 py-3 flex items-start justify-between">
            <div>
              <div className="font-mono text-text-primary text-sm font-bold">
                {conflict.file}
              </div>
              <div className="font-mono text-xs text-text-secondary mt-1">
                Resolution: <span className={
                  conflict.status === 'unresolved' ? 'text-error font-bold' : 
                  conflict.status === 'manual' ? 'text-warning' : 'text-success'
                }>
                  {conflict.status.toUpperCase()}
                </span>
                {conflict.resolvedBy && (
                  <span className="text-text-muted ml-2">by {conflict.resolvedBy}</span>
                )}
              </div>
            </div>
            
            {conflict.status === 'unresolved' && (
              <div className="flex gap-2">
                <button className="px-2 py-1 bg-bg-primary border border-border text-xs text-text-primary hover:border-accent">
                  Resolve...
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
