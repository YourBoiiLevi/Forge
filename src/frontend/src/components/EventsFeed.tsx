import { useEffect, useRef, useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import { ForgeEvent, EventType, AgentLogData } from '../lib/types';

interface EventsFeedProps {
  events: ForgeEvent[];
  className?: string;
  maxEvents?: number;
}

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  run_status_changed: 'text-blue-400',
  task_created: 'text-purple-400',
  task_status_changed: 'text-yellow-400',
  agent_log: 'text-zinc-400',
  artifact_created: 'text-green-400',
  change_request_created: 'text-orange-400',
  change_request_updated: 'text-orange-400',
  ping: 'text-zinc-700',
};

export function EventsFeed({ events, className, maxEvents = 500 }: EventsFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterType, setFilterType] = useState<EventType | 'all'>('all');

  // Filter events
  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (filterType !== 'all') {
      filtered = events.filter(e => e.type === filterType);
    }
    return filtered.slice(-maxEvents);
  }, [events, filterType, maxEvents]);

  // Handle auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents, autoScroll]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className={cn("flex flex-col h-full border border-zinc-800 bg-zinc-950 rounded-sm font-mono text-xs", className)}>
      <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-900/50">
        <span className="text-zinc-400 uppercase font-semibold tracking-wider">Events Feed</span>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as EventType | 'all')}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 rounded-sm px-1 py-0.5 text-[10px] focus:border-orange-500 focus:outline-none"
          >
            <option value="all">ALL EVENTS</option>
            <option value="agent_log">LOGS</option>
            <option value="task_status_changed">TASKS</option>
            <option value="artifact_created">ARTIFACTS</option>
            <option value="change_request_created">CHANGES</option>
          </select>
          <div className={cn("w-2 h-2 rounded-full", autoScroll ? "bg-green-500" : "bg-zinc-600")} title={autoScroll ? "Auto-scroll ON" : "Auto-scroll PAUSED"} />
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-zinc-600 italic text-center mt-4">No events to display...</div>
        ) : (
          filteredEvents.map((event) => (
            <div key={event.eventId} className="flex gap-2 hover:bg-zinc-900/50 px-1 rounded-sm">
              <span className="text-zinc-600 shrink-0 select-none">
                {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
              </span>
              <span className={cn("uppercase shrink-0 w-32 truncate font-medium", EVENT_TYPE_COLORS[event.type])}>
                {event.type.replace(/_/g, ' ')}
              </span>
              <span className="text-zinc-300 break-all whitespace-pre-wrap">
                {formatEventData(event)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatEventData(event: ForgeEvent): string {
  if (typeof event.data === 'string') return event.data;
  
  if (event.type === 'agent_log') {
    const data = event.data as AgentLogData;
    return `[${data.agentId}] ${data.message}`;
  }
  
  if (event.type === 'task_status_changed') {
    const data = event.data as { taskId: string; status: string };
    return `Task ${data.taskId} is now ${data.status}`;
  }

  if (event.type === 'artifact_created') {
     const data = event.data as { path: string };
     return `Created ${data.path}`;
  }

  return JSON.stringify(event.data);
}
