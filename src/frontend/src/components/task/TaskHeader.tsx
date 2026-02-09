import { Task } from '../../lib/types';
import { StatusLED } from '../ui/StatusLED';
import { Copy, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';
import { useNavigate } from 'react-router-dom';

interface TaskHeaderProps {
  task: Task;
  onBack: () => void;
}

export function TaskHeader({ task, onBack }: TaskHeaderProps) {
  const handleCopyBranch = () => {
    // In a real app, this would use the clipboard API
    // navigator.clipboard.writeText(task.branch || '');
    console.log('Copied branch name:', 'task-branch-placeholder'); 
  };

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        <div>
          <div className="flex items-center gap-3 mb-1">
            <StatusLED status={task.status} size="md" showLabel />
            <span className="text-text-secondary font-mono text-xs">ID: {task.taskId}</span>
            {task.type && (
               <span className="bg-surface border border-border px-1.5 py-0.5 text-[10px] uppercase font-mono text-text-secondary">
                 {task.type}
               </span>
            )}
          </div>
          <h1 className="font-pixel text-xl text-text-primary">{task.title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-6 font-mono text-sm">
        {task.dependencies && task.dependencies.length > 0 && (
          <div className="flex flex-col items-end">
            <span className="text-text-secondary text-xs uppercase mb-0.5">Dependencies</span>
            <div className="flex gap-1">
              {task.dependencies.map(depId => (
                <span key={depId} className="bg-primary border border-border px-1.5 py-0.5 text-xs text-text-secondary hover:text-accent cursor-pointer transition-colors">
                  {depId.slice(0, 8)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col items-end">
          <span className="text-text-secondary text-xs uppercase mb-0.5">Branch</span>
          <div className="flex items-center gap-2 group cursor-pointer" onClick={handleCopyBranch}>
             <span className="text-accent">task-branch-placeholder</span>
             <Copy className="h-3 w-3 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex flex-col items-end">
           <span className="text-text-secondary text-xs uppercase mb-0.5">Agent</span>
           <span className="text-text-primary">{task.agentId || '—'}</span>
        </div>
      </div>
    </div>
  );
}
