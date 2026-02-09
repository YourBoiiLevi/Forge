import { useMemo } from 'react';
import { cn } from '../lib/utils';
import { Task } from '../lib/types';
import { StatusLED } from './ui/StatusLED';

interface ActiveAgentsPanelProps {
  tasks: Task[];
  className?: string;
}

export function ActiveAgentsPanel({ tasks, className }: ActiveAgentsPanelProps) {
  // Filter for running tasks and simulate agent info since we don't have a direct agent state
  const activeTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'running');
  }, [tasks]);

  return (
    <div className={cn("flex flex-col border border-zinc-800 bg-zinc-950 rounded-sm font-mono text-sm", className)}>
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <h3 className="text-zinc-400 uppercase font-semibold tracking-wider text-xs">Active Agents</h3>
        <span className="bg-orange-500/10 text-orange-500 text-[10px] px-1.5 py-0.5 rounded border border-orange-500/20">
          {activeTasks.length} RUNNING
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTasks.length === 0 ? (
          <div className="text-zinc-600 text-center py-8 italic text-xs">
            No agents currently active.
          </div>
        ) : (
          activeTasks.map(task => (
            <AgentCard key={task.taskId} task={task} />
          ))
        )}
      </div>
    </div>
  );
}

function AgentCard({ task }: { task: Task }) {
  // Mock data for display - in real app this would come from agent stream or state
  // const agentType = (task.agentId?.split('-')[0] || 'developer') as AgentType;
  
  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusLED status="running" size="sm" />
          <span className="text-orange-400 font-bold text-xs uppercase">{task.agentId || 'UNKNOWN-AGENT'}</span>
        </div>
        <span className="text-zinc-600 text-[10px]">00:42s</span>
      </div>
      
      <div className="text-zinc-300 text-xs truncate font-medium" title={task.title}>
        {task.title}
      </div>

      {/* Mock terminal output */}
      <div className="bg-black/50 border border-zinc-800/50 rounded p-2 text-[10px] font-mono text-zinc-400 h-16 overflow-hidden relative">
        <div className="absolute inset-0 p-2 overflow-hidden">
          <div className="opacity-50">Analyzing dependencies...</div>
          <div className="opacity-75">Found 3 affected files.</div>
          <div className="text-zinc-300">Generating implementation plan...<span className="animate-pulse">_</span></div>
        </div>
      </div>
    </div>
  );
}
