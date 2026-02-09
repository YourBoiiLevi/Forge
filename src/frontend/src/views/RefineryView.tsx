import { useState } from 'react';
import { Layout } from '../components/Layout';
import { MergeStatusTable } from '../components/refinery/MergeStatusTable';
import { ConflictPanel } from '../components/refinery/ConflictPanel';
import { IntegrationResults } from '../components/refinery/IntegrationResults';
import { CRBanner } from '../components/refinery/CRBanner';
import { ActiveAgentsPanel } from '../components/ActiveAgentsPanel';
import { MOCK_BRANCHES, MOCK_CONFLICTS, MOCK_TEST_RESULTS, MOCK_CHANGE_REQUESTS, MOCK_AGENTS } from '../components/refinery/types';
import { MergeBranch } from '../components/refinery/types';
import { Task } from '../lib/types';

export function RefineryView() {
  const [selectedBranch, setSelectedBranch] = useState<MergeBranch>(MOCK_BRANCHES[0]);

  // Filter conflicts and tests for selected branch (mock logic)
  const currentConflicts = selectedBranch.status === 'conflict' ? MOCK_CONFLICTS : [];
  const currentTests = selectedBranch.status === 'merged' || selectedBranch.status === 'failed' ? MOCK_TEST_RESULTS : null;

  // Adapt mock agents to Task type for ActiveAgentsPanel
  const activeAgentTasks: Task[] = MOCK_AGENTS.map(agent => ({
    taskId: agent.id,
    title: agent.currentTask,
    status: agent.status === 'idle' ? 'pending' : 'running',
    agentId: agent.id,
    type: 'process',
    parentId: null,
    dependencies: [],
    context: {},
    runId: 'mock-run-id',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  return (
    <Layout>
      <div className="h-full flex flex-col p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-pixel text-text-primary uppercase tracking-wider">
              Refinery
            </h1>
            <div className="text-text-secondary font-mono text-xs mt-1">
              Merge integration and conflict resolution
            </div>
          </div>
        </div>

        <CRBanner changeRequests={MOCK_CHANGE_REQUESTS} />

        <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
          {/* Main Content - Left 2 Columns */}
          <div className="col-span-2 flex flex-col gap-6 overflow-y-auto pr-2">
            <MergeStatusTable 
              branches={MOCK_BRANCHES}
              selectedBranchId={selectedBranch.id}
              onSelectBranch={setSelectedBranch}
            />

            {selectedBranch.status === 'conflict' && (
              <ConflictPanel conflicts={currentConflicts} />
            )}

            {(selectedBranch.status === 'merged' || selectedBranch.status === 'failed') && (
              <IntegrationResults results={currentTests} />
            )}
            
            {/* Refinery Log Mockup */}
            <div className="border border-border bg-bg-surface p-4 font-mono text-xs">
              <h3 className="font-pixel text-text-primary text-sm uppercase mb-3">Refinery Log</h3>
              <div className="space-y-1 text-text-secondary">
                <div className="flex gap-2"><span className="text-text-muted">[12:04:01]</span> <span>Merging branch task/implement-auth into main</span></div>
                {selectedBranch.status === 'conflict' && (
                   <>
                    <div className="flex gap-2"><span className="text-text-muted">[12:04:03]</span> <span className="text-error">Conflict detected: src/routes.ts</span></div>
                    <div className="flex gap-2"><span className="text-text-muted">[12:04:05]</span> <span>Spawning agent refinery-01 to resolve conflict</span></div>
                   </>
                )}
                 {selectedBranch.status === 'merged' && (
                   <>
                    <div className="flex gap-2"><span className="text-text-muted">[12:04:23]</span> <span>Running integration tests...</span></div>
                    <div className="flex gap-2"><span className="text-text-muted">[12:04:45]</span> <span className="text-success">Tests passed (28/28)</span></div>
                    <div className="flex gap-2"><span className="text-text-muted">[12:04:46]</span> <span>Merge complete</span></div>
                   </>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar - Right Column */}
          <div className="flex flex-col gap-6 overflow-y-auto">
            <ActiveAgentsPanel 
              tasks={activeAgentTasks} 
              className="flex-1 max-h-[50%]"
            />
            
            {/* Context/Stats Panel */}
            <div className="border border-border bg-bg-surface p-4 flex-1">
              <h3 className="font-pixel text-text-primary text-sm uppercase mb-3">Integration Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-primary p-3 border border-border">
                  <div className="text-text-secondary text-xs font-mono uppercase">Success Rate</div>
                  <div className="text-success text-2xl font-pixel mt-1">94%</div>
                </div>
                <div className="bg-bg-primary p-3 border border-border">
                  <div className="text-text-secondary text-xs font-mono uppercase">Avg Merge Time</div>
                  <div className="text-text-primary text-2xl font-pixel mt-1">4m 12s</div>
                </div>
                <div className="bg-bg-primary p-3 border border-border">
                  <div className="text-text-secondary text-xs font-mono uppercase">Active CRs</div>
                  <div className="text-warning text-2xl font-pixel mt-1">1</div>
                </div>
                <div className="bg-bg-primary p-3 border border-border">
                  <div className="text-text-secondary text-xs font-mono uppercase">Queue</div>
                  <div className="text-text-primary text-2xl font-pixel mt-1">2</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
