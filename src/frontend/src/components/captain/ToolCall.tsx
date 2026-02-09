import React, { useState } from 'react';
import { ToolCallData } from './types';
import { StatusLED } from '../ui/StatusLED';

interface ToolCallProps {
  data: ToolCallData;
}

export const ToolCall: React.FC<ToolCallProps> = ({ data }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, args, result, status } = data;

  return (
    <div className="border border-border rounded overflow-hidden bg-surface-raised/50 text-xs font-mono">
      {/* Header */}
      <div
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-surface-raised transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <StatusLED
            status={status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'done'}
            size="sm"
          />
          <span className="text-accent font-bold shrink-0">{name}</span>
          <span className="text-text-muted truncate opacity-70">
             {JSON.stringify(args).slice(0, 50)}
          </span>
        </div>
        <div className="text-text-muted">
          {isExpanded ? '▼' : '▶'}
        </div>
      </div>

      {result !== undefined && result !== null && (
        <div className="border-t border-border p-2 bg-surface-muted/30">
          <div className="mb-2">
            <div className="text-text-muted uppercase text-[10px] mb-1">Arguments</div>
            <pre className="overflow-x-auto p-1 text-text">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-text-muted uppercase text-[10px] mb-1">Result</div>
            <pre className="overflow-x-auto p-1 text-text opacity-80">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
