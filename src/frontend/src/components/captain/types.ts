// Types for Captain Interview components

export type MessageRole = 'user' | 'captain';

export interface ToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'running' | 'completed' | 'failed';
  timestamp: string;
}

export interface ArtifactLink {
  path: string;
  type: 'spec' | 'task' | 'dag';
  id: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallData[];
  artifacts?: ArtifactLink[];
}

export interface PlanData {
  id: string;
  title: string;
  summary: string;
  artifacts: {
    specs: string[];
    tasks: string[];
    dag: string;
  };
}

export interface CaptainState {
  messages: Message[];
  isThinking: boolean;
  isStreaming: boolean;
  plan?: PlanData;
  runId: string;
}
