export interface MergeOperation {
  id: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'merging' | 'merged' | 'conflict' | 'failed';
  strategy: 'fast-forward' | 'three-way' | 'squash';
  conflicts: Conflict[];
  tests: TestResult;
  subAgents: SubAgent[];
  progress: ProgressLog[];
}

export interface Conflict {
  file: string;
  status: 'unresolved' | 'auto-resolved' | 'agent-resolved' | 'manual';
  resolvedBy?: string;
}

export interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  details: TestDetail[];
}

export interface TestDetail {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
}

export interface SubAgent {
  id: string;
  task: string;
  status: 'running' | 'done' | 'failed';
}

export interface ProgressLog {
  timestamp: string;
  message: string;
}

export const MOCK_MERGE_OPS: MergeOperation[] = [
  {
    id: 'merge-001',
    sourceBranch: 'task/implement-auth',
    targetBranch: 'main',
    status: 'conflict',
    strategy: 'three-way',
    conflicts: [
      { file: 'src/routes.ts', status: 'unresolved' },
      { file: 'src/config.ts', status: 'agent-resolved', resolvedBy: 'refinery-01' },
    ],
    tests: {
      passed: 0,
      failed: 0,
      skipped: 28,
      details: [],
    },
    subAgents: [
      { id: 'refinery-01', task: 'resolve conflict in src/config.ts', status: 'done' },
      { id: 'refinery-02', task: 'resolve conflict in src/routes.ts', status: 'running' },
    ],
    progress: [
      { timestamp: '12:04:01', message: 'Merging branch task/implement-auth into main' },
      { timestamp: '12:04:03', message: 'Conflict detected: src/routes.ts' },
      { timestamp: '12:04:03', message: 'Conflict detected: src/config.ts' },
      { timestamp: '12:04:05', message: 'Spawning agent refinery-01 to resolve conflict in src/config.ts' },
      { timestamp: '12:04:22', message: 'Conflict resolved by refinery-01' },
      { timestamp: '12:04:25', message: 'Spawning agent refinery-02 to resolve conflict in src/routes.ts' },
    ],
  },
  {
    id: 'merge-002',
    sourceBranch: 'task/fix-ui-bug',
    targetBranch: 'main',
    status: 'merged',
    strategy: 'fast-forward',
    conflicts: [],
    tests: {
      passed: 14,
      failed: 0,
      skipped: 0,
      details: [
        { name: 'UI renders correctly', status: 'pass', duration: 45 },
        { name: 'Button is clickable', status: 'pass', duration: 32 },
      ],
    },
    subAgents: [],
    progress: [
      { timestamp: '11:58:10', message: 'Merging branch task/fix-ui-bug into main' },
      { timestamp: '11:58:12', message: 'Fast-forward merge successful' },
      { timestamp: '11:58:15', message: 'Running integration tests...' },
      { timestamp: '11:58:45', message: 'Tests passed (14/14)' },
      { timestamp: '11:58:46', message: 'Merge complete' },
    ],
  },
];
