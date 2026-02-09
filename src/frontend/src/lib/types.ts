// Type definitions for the Forge SDK Client

export type RunStatus = 'pending' | 'running' | 'done' | 'failed' | 'merged' | 'stale';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';
export type AgentType = 'captain' | 'planner' | 'developer' | 'reviewer' | 'tester';

export interface Run {
  runId: string;
  repoUrl: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  stats?: {
    tasksTotal: number;
    tasksCompleted: number;
    tasksFailed: number;
    elapsedTime: number;
  };
}

export interface Task {
  taskId: string;
  runId: string;
  title: string;
  type: string;
  status: TaskStatus;
  agentId?: string;
  dependencies: string[]; // Task IDs
  artifacts?: string[]; // Paths
  createdAt: string;
  updatedAt: string;
}

export interface ChangeRequest {
  crId: string;
  runId: string;
  title: string;
  sourceBranch: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  description: string;
  impact: string;
  createdAt: string;
}

// Event Types for NDJSON Stream
export type EventType = 
  | 'run_status_changed'
  | 'task_created'
  | 'task_status_changed'
  | 'agent_log'
  | 'artifact_created'
  | 'change_request_created'
  | 'change_request_updated'
  | 'ping';

export interface ForgeEvent<T = unknown> {
  eventId: string;
  runId: string;
  type: EventType;
  timestamp: string;
  data: T;
}

export interface AgentLogData {
  taskId: string;
  agentId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

// API Request Options
export interface CreateRunOptions {
  model?: string;
  customInstructions?: string;
}

export interface StreamOptions {
  after?: string; // eventId
}
