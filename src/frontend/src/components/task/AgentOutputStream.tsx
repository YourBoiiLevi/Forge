import { useEffect, useRef, useState } from 'react';
import { AgentLogData } from '../../lib/types';
import { cn } from '../../lib/utils';

interface AgentOutputStreamProps {
  logs: AgentLogData[];
  isStreaming?: boolean;
}

export function AgentOutputStream({ logs, isStreaming = false }: AgentOutputStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If user scrolls up, disable auto-scroll. 
    // Tolerance of 10px to account for rounding errors.
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="flex flex-col h-full bg-primary font-mono text-sm relative overflow-hidden">
        {/* Scrollable Log Area */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
        >
          {logs.length === 0 && (
             <div className="text-text-secondary italic opacity-50">Waiting for agent output...</div>
          )}
          
          {logs.map((log, index) => (
            <div key={index} className={cn("break-words whitespace-pre-wrap leading-relaxed", {
                "text-text-primary": log.level === 'info',
                "text-error": log.level === 'error',
                "text-warning": log.level === 'warn',
                "text-text-secondary": log.level === 'debug',
            })}>
                <span className="text-text-secondary mr-3 text-xs opacity-50 select-none">
                  {/* We could add timestamp here if available in log object */}
                  {index + 1}
                </span>
                {log.message}
            </div>
          ))}

          {isStreaming && (
            <div className="animate-pulse text-accent mt-2">_</div>
          )}
        </div>

        {/* Scroll Lock Indicator */}
        {!autoScroll && (
            <button 
                onClick={() => setAutoScroll(true)}
                className="absolute bottom-4 right-4 bg-surface border border-accent text-accent px-3 py-1 text-xs shadow-lg z-10 hover:bg-accent hover:text-white transition-colors"
            >
                Resume Auto-scroll
            </button>
        )}
    </div>
  );
}
