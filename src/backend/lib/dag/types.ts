import type { TaskStatus, TaskType } from '../task-artifact';

export type DAGVersion = 1;

export interface DAGMetadata {
  createdAt: string;
  createdBy: 'captain';
  totalTasks: number;
  totalRefineries: number;
}

export interface DAGNode {
  /** Matches taskId everywhere else in the system (e.g. "task-001"). */
  id: string;
  type: 'task' | 'refinery';
  /** Which agent class executes this node. */
  agentType: Exclude<TaskType, 'refinery'> | 'refinery';
  /** Blocking dependencies; must reach MERGED before this node can start. */
  dependencies: string[];
  status: TaskStatus;
  metadata?: Record<string, unknown>;
}

export interface DAG {
  version: DAGVersion;
  runId: string;
  nodes: DAGNode[];
  metadata: DAGMetadata;
}
