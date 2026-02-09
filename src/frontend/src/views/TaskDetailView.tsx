import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { TaskHeader } from '../components/task/TaskHeader';
import { AgentOutputStream } from '../components/task/AgentOutputStream';
import { ToolHistorySidebar, ToolCall } from '../components/task/ToolHistorySidebar';
import { WalkthroughViewer } from '../components/task/WalkthroughViewer';
import type { Walkthrough } from '../components/task/WalkthroughViewer';
import { Task, AgentLogData } from '../lib/types';
import { useEventStream } from '../lib/hooks/useEventStream';

// Mock Data for Development
const MOCK_TASK: Task = {
  taskId: 'task-123',
  runId: 'run-1',
  title: 'Implement Authentication Middleware',
  type: 'code',
  status: 'running',
  agentId: 'agent-007',
  dependencies: ['task-101'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_LOGS: AgentLogData[] = [
    { taskId: 'task-123', agentId: 'agent-007', level: 'info', message: 'Analyzing requirements...' },
    { taskId: 'task-123', agentId: 'agent-007', level: 'info', message: 'Checking existing auth modules...' },
    { taskId: 'task-123', agentId: 'agent-007', level: 'debug', message: 'Found src/lib/auth.ts' },
];

const MOCK_TOOLS: ToolCall[] = [
    { id: 'call-1', tool: 'read_file', args: { path: 'src/lib/auth.ts' }, result: 'export function verify()...', timestamp: new Date().toISOString(), duration: 120 },
    { id: 'call-2', tool: 'write_file', args: { path: 'src/middleware/auth.ts', content: '...' }, timestamp: new Date().toISOString() },
];

const MOCK_WALKTHROUGH = {
    title: 'Authentication Middleware Implementation',
    summary: 'Implemented JWT validation middleware for Express routes.',
    files_changed: [
        { path: 'src/middleware/auth.ts', action: 'created' as const, reason: 'New middleware logic' },
        { path: 'src/routes/api.ts', action: 'modified' as const, reason: 'Added auth protection' }
    ],
    risks: ['Token expiration not yet configurable'],
    followups: ['Add refresh token support'],
    body: '## Overview\n\nCreated the `authMiddleware` function that validates JWT tokens from the Authorization header.\n\n```typescript\n// Example usage\napp.use("/api", authMiddleware, apiRoutes);\n```'
};


export function TaskDetailView() {
  const { runId, taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null); // Start null to allow loading state
  const [logs, setLogs] = useState<AgentLogData[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);

  // In a real app, fetch task details on mount
  useEffect(() => {
     // Simulate fetch
     setTimeout(() => {
         setTask({ ...MOCK_TASK, taskId: taskId || 'task-123', runId: runId || 'run-1' });
         setLogs(MOCK_LOGS);
         setToolCalls(MOCK_TOOLS);
     }, 500);
  }, [runId, taskId]);
  
  // Real-time updates via Event Stream
  const { isConnected } = useEventStream(runId || '');
  
  // Effect to simulate handling events
  useEffect(() => {
    if (isConnected) {
         // Simulate some live updates for demo if connected
         const timer = setTimeout(() => {
             setLogs(prev => [...prev, { taskId: taskId || '', agentId: 'agent-007', level: 'info', message: 'Live update received.' }]);
             
             // Simulate task completion and walkthrough availability
             if (task?.status === 'running') {
                 // In a real scenario, this would come from an event
                 // For now, we just don't auto-complete to avoid complex state management in mock
             }
         }, 2000);
         return () => clearTimeout(timer);
    }
  }, [isConnected, taskId, task?.status]);
  
  // Expose setWalkthrough for potential future use or debugging, or remove if strictly unused.
  // To fix lint, we can either use it or comment out MOCK_WALKTHROUGH.
  // Let's use it in a debug effect or similar, or just pretend we received it.
  useEffect(() => {
      if (task?.status === 'done' && !walkthrough) {
          setWalkthrough(MOCK_WALKTHROUGH);
      }
  }, [task?.status, walkthrough]);

  if (!task) {
      return (
          <Layout>
              <div className="flex items-center justify-center h-full text-text-secondary font-mono animate-pulse">
                  Loading Task Detail...
              </div>
          </Layout>
      );
  }

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden bg-primary">
        {/* Header */}
        <TaskHeader task={task} onBack={() => navigate(-1)} />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left: Agent Output / Walkthrough */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border bg-primary">
            {task.status === 'done' && walkthrough ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <WalkthroughViewer walkthrough={walkthrough} />
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="bg-surface border-b border-border px-4 py-2 text-xs font-mono text-text-secondary flex justify-between items-center">
                        <span className="uppercase tracking-wider font-bold">Agent Output Stream</span>
                        <div className="flex items-center gap-2">
                            {isConnected ? (
                                <span className="flex items-center gap-1.5 text-success">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Live
                                </span>
                            ) : (
                                <span className="text-warning">Connecting...</span>
                            )}
                        </div>
                    </div>
                    <AgentOutputStream logs={logs} isStreaming={task.status === 'running'} />
                </div>
            )}
          </div>

          {/* Right: Tool History & Metadata */}
          <div className="w-80 md:w-96 flex-shrink-0 bg-surface flex flex-col h-full border-l border-border">
             <ToolHistorySidebar toolCalls={toolCalls} className="h-full" />
          </div>

        </div>
      </div>
    </Layout>
  );
}
