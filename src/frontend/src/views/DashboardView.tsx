import { useState } from 'react';
import { Layout } from '../components/Layout';
import { DAGGraph } from '../components/dag/DAGGraph';
import { TaskList } from '../components/TaskList';
import { ActiveAgentsPanel } from '../components/ActiveAgentsPanel';
import { EventsFeed } from '../components/EventsFeed';
import { Task, ForgeEvent } from '../lib/types';

// Mock Data
const MOCK_TASKS: Task[] = [
  { taskId: 'task-1', runId: 'run-1', title: 'Initialize Project', type: 'setup', status: 'done', dependencies: [], createdAt: '', updatedAt: '' },
  { taskId: 'task-2', runId: 'run-1', title: 'Setup Database Schema', type: 'database', status: 'done', dependencies: ['task-1'], createdAt: '', updatedAt: '' },
  { taskId: 'task-3', runId: 'run-1', title: 'Implement Auth API', type: 'backend', status: 'running', agentId: 'dev-agent-01', dependencies: ['task-2'], createdAt: '', updatedAt: '' },
  { taskId: 'task-4', runId: 'run-1', title: 'Create Login Page', type: 'frontend', status: 'pending', dependencies: ['task-1'], createdAt: '', updatedAt: '' },
  { taskId: 'task-5', runId: 'run-1', title: 'Write API Tests', type: 'testing', status: 'pending', dependencies: ['task-3'], createdAt: '', updatedAt: '' },
];

const MOCK_EVENTS: ForgeEvent[] = [
  { eventId: '1', runId: 'run-1', type: 'run_status_changed', timestamp: new Date(Date.now() - 10000).toISOString(), data: { status: 'running' } },
  { eventId: '2', runId: 'run-1', type: 'task_created', timestamp: new Date(Date.now() - 9000).toISOString(), data: { taskId: 'task-1', title: 'Initialize Project' } },
  { eventId: '3', runId: 'run-1', type: 'task_status_changed', timestamp: new Date(Date.now() - 8000).toISOString(), data: { taskId: 'task-1', status: 'done' } },
  { eventId: '4', runId: 'run-1', type: 'agent_log', timestamp: new Date(Date.now() - 5000).toISOString(), data: { agentId: 'dev-agent-01', message: 'Starting implementation of Auth API', level: 'info' } },
  { eventId: '5', runId: 'run-1', type: 'agent_log', timestamp: new Date(Date.now() - 2000).toISOString(), data: { agentId: 'dev-agent-01', message: 'Generating database migration...', level: 'info' } },
];

export function DashboardView() {
  const [tasks] = useState<Task[]>(MOCK_TASKS);
  const [events] = useState<ForgeEvent[]>(MOCK_EVENTS);

  return (
    <Layout>
      <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
        {/* Top Row: DAG & Active Agents */}
        <div className="flex h-1/2 gap-4 min-h-[300px]">
          {/* Main Visualization Area (DAG) */}
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-sm relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 p-2 z-10 bg-zinc-950/80 backdrop-blur-sm border-b border-r border-zinc-800 rounded-br-sm">
              <span className="text-zinc-500 font-mono text-xs uppercase tracking-wider">Dependency Graph</span>
            </div>
            <DAGGraph tasks={tasks} className="w-full h-full" />
          </div>
          
          {/* Active Agents Side Panel */}
          <div className="w-80 shrink-0">
             <ActiveAgentsPanel tasks={tasks} className="h-full" />
          </div>
        </div>

        {/* Bottom Row: Task List & Events */}
        <div className="flex h-1/2 gap-4 min-h-[300px]">
          {/* Task List */}
          <div className="flex-1 overflow-hidden flex flex-col">
             <TaskList tasks={tasks} className="h-full" />
          </div>

          {/* Events Feed */}
          <div className="w-[450px] shrink-0">
             <EventsFeed events={events} className="h-full" />
          </div>
        </div>
      </div>
    </Layout>
  );
}
