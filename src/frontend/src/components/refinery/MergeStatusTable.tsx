import { StatusLED } from '../ui/StatusLED';
import { MergeBranch } from './types';

interface MergeStatusTableProps {
  branches: MergeBranch[];
  onSelectBranch: (branch: MergeBranch) => void;
  selectedBranchId?: string;
}

export function MergeStatusTable({
  branches,
  onSelectBranch,
  selectedBranchId,
}: MergeStatusTableProps) {
  return (
    <div className="border border-border bg-bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-pixel text-text-primary text-sm uppercase">Merge Progress</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-bg-primary text-text-secondary text-xs uppercase">
              <th className="px-4 py-2 w-10">Status</th>
              <th className="px-4 py-2">Source Branch</th>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Strategy</th>
              <th className="px-4 py-2 text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => {
              const isSelected = branch.id === selectedBranchId;
              
              return (
                <tr
                  key={branch.id}
                  onClick={() => onSelectBranch(branch)}
                  className={`
                    border-b border-border last:border-0 cursor-pointer transition-colors
                    ${isSelected ? 'bg-bg-primary border-l-2 border-l-accent' : 'hover:bg-bg-primary/50'}
                  `}
                >
                  <td className="px-4 py-3">
                    <StatusLED 
                      status={
                        branch.status === 'merging' ? 'running' :
                        branch.status === 'merged' ? 'done' :
                        branch.status === 'conflict' ? 'failed' :
                        'pending'
                      } 
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {branch.sourceBranch}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {branch.targetBranch}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {branch.strategy}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-right">
                    {branch.updatedAt}
                  </td>
                </tr>
              );
            })}
            
            {branches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted italic">
                  No active merges
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
