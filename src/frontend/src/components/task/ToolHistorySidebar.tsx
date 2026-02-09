import { useState } from 'react';
import { cn } from '../../lib/utils';
import { ChevronRight, ChevronDown, Clock, Terminal, AlertCircle } from 'lucide-react';

export interface ToolCall {
  id: string;
  tool: string;
  args: any;
  result?: any;
  error?: string;
  timestamp: string;
  duration?: number; // in ms
}

interface ToolHistorySidebarProps {
  toolCalls: ToolCall[];
  className?: string;
}

export function ToolHistorySidebar({ toolCalls, className }: ToolHistorySidebarProps) {
  return (
    <div className={cn("flex flex-col bg-surface border-l border-border h-full overflow-hidden", className)}>
      <div className="p-3 border-b border-border bg-surface">
        <h3 className="font-pixel text-xs uppercase text-text-secondary tracking-wider">Tool History</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {toolCalls.length === 0 && (
           <div className="text-center p-4 text-text-secondary text-xs italic">No tools called yet</div>
        )}
        {toolCalls.map((call) => (
          <ToolCallItem key={call.id} call={call} />
        ))}
      </div>
    </div>
  );
}

function ToolCallItem({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const isError = !!call.error;

  return (
    <div className={cn("border bg-primary transition-all text-xs font-mono", 
        isError ? "border-error/50" : "border-border",
        expanded ? "shadow-md" : ""
    )}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className={cn("w-full flex items-center gap-2 p-2 hover:bg-surface/50 text-left transition-colors", 
            isError ? "bg-error/5 text-error" : ""
        )}
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="font-bold text-accent shrink-0">{call.tool}</span>
        <span className="truncate text-text-secondary opacity-75">{JSON.stringify(call.args).slice(0, 30)}...</span>
        
        {call.duration && (
            <span className="ml-auto text-[10px] text-text-secondary whitespace-nowrap opacity-50 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {call.duration}ms
            </span>
        )}
      </button>

      {expanded && (
        <div className="p-2 border-t border-border space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
           <div className="space-y-1">
              <div className="text-[10px] uppercase text-text-secondary flex items-center gap-1">
                  <Terminal className="h-3 w-3" /> Arguments
              </div>
              <pre className="bg-surface p-2 overflow-x-auto text-text-primary border border-border/50">
                  {JSON.stringify(call.args, null, 2)}
              </pre>
           </div>

           {call.result && (
             <div className="space-y-1">
                <div className="text-[10px] uppercase text-text-secondary">Result</div>
                <pre className="bg-surface p-2 overflow-x-auto text-text-secondary border border-border/50 max-h-40">
                    {typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)}
                </pre>
             </div>
           )}

           {call.error && (
             <div className="space-y-1">
                <div className="text-[10px] uppercase text-error flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Error
                </div>
                <pre className="bg-error/10 text-error p-2 overflow-x-auto border border-error/20">
                    {call.error}
                </pre>
             </div>
           )}
           
           <div className="text-[10px] text-text-secondary text-right pt-1 border-t border-border/30">
               {new Date(call.timestamp).toLocaleTimeString()}
           </div>
        </div>
      )}
    </div>
  );
}
