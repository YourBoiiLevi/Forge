import { ChangeRequest } from '../../lib/types';

// Core types for Refinery
export interface MergeBranch {
  id: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'merging' | 'merged' | 'conflict' | 'failed' | 'pending';
  strategy: 'fast-forward' | 'three-way' | 'squash';
  updatedAt: string;
}

export interface Conflict {
  file: string;
  status: 'unresolved' | 'auto-resolved' | 'agent-resolved' | 'manual';
  resolvedBy?: string;
}

export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface TestSuite {
  passed: number;
  failed: number;
  skipped: number;
  cases: TestCase[];
}

// Mock Data
export const MOCK_BRANCHES: MergeBranch[] = [
  {
    id: 'merge-001',
    sourceBranch: 'task/implement-auth',
    targetBranch: 'main',
    status: 'conflict',
    strategy: 'three-way',
    updatedAt: '12:04:03',
  },
  {
    id: 'merge-002',
    sourceBranch: 'task/fix-ui-bug',
    targetBranch: 'main',
    status: 'merged',
    strategy: 'fast-forward',
    updatedAt: '11:58:46',
  },
];

export const MOCK_CONFLICTS: Conflict[] = [
  { file: 'src/routes.ts', status: 'unresolved' },
  { file: 'src/config.ts', status: 'agent-resolved', resolvedBy: 'refinery-01' },
];

export const MOCK_TEST_RESULTS: TestSuite = {
  passed: 14,
  failed: 0,
  skipped: 0,
  cases: [
    { name: 'UI renders correctly', status: 'passed', duration: 45 },
    { name: 'Button is clickable', status: 'passed', duration: 32 },
  ],
};

export const MOCK_CHANGE_REQUESTS: ChangeRequest[] = [
  {
    crId: 'CR-123',
    runId: 'run-1',
    sourceBranch: 'feature/auth',
    title: 'Update Authentication Flow',
    status: 'pending',
    impact: 'high',
    createdAt: '2023-10-27T10:00:00Z',
    description: 'Update auth flow to support MFA'
  }
];

export const MOCK_AGENTS = [
    {
        id: 'refinery-01',
        name: 'Refinery Agent 01',
        status: 'idle' as const,
        currentTask: 'Waiting for tasks',
        logs: []
    }
];
