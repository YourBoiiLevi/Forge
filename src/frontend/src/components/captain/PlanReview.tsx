import React from 'react';
import { PlanData } from './types';
import { Button } from '../ui/Button';

interface PlanReviewProps {
  plan: PlanData;
  onApprove: () => void;
  onEdit?: () => void;
  isExecuting?: boolean;
}

export const PlanReview: React.FC<PlanReviewProps> = ({
  plan,
  onApprove,
  onEdit,
  isExecuting = false,
}) => {
  return (
    <div className="border-2 border-accent bg-surface rounded-lg p-6 mb-8 shadow-lg shadow-accent/10">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Plan Finalized</h2>
          <p className="text-text-muted text-sm">{plan.summary}</p>
        </div>
        <div className="px-3 py-1 bg-accent/20 text-accent border border-accent rounded text-xs uppercase font-bold tracking-wider">
          Review Required
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h3 className="text-sm font-bold text-text-muted uppercase mb-3 border-b border-border pb-1">
            Artifacts to Create
          </h3>
          <ul className="space-y-2 text-sm font-mono">
            {plan.artifacts.specs.map((spec) => (
              <li key={spec} className="flex items-center gap-2 text-text">
                <span className="text-accent">📄</span> {spec}
              </li>
            ))}
            {plan.artifacts.tasks.map((task) => (
              <li key={task} className="flex items-center gap-2 text-text">
                <span className="text-accent">✅</span> {task}
              </li>
            ))}
          </ul>
        </div>
        
        <div>
          <h3 className="text-sm font-bold text-text-muted uppercase mb-3 border-b border-border pb-1">
            Execution Graph
          </h3>
          <div className="bg-surface-raised p-3 rounded border border-border h-32 flex items-center justify-center text-text-muted text-xs italic">
            DAG Preview (Visualized in Dashboard)
            <br />
            {plan.artifacts.dag}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t border-border">
        {onEdit && (
          <Button variant="outline" onClick={onEdit} disabled={isExecuting}>
            Edit Plan
          </Button>
        )}
        <Button 
          variant="primary" 
          onClick={onApprove} 
          disabled={isExecuting}
          className="min-w-[150px]"
        >
          {isExecuting ? 'Executing...' : 'Approve & Execute'}
        </Button>
      </div>
    </div>
  );
};
