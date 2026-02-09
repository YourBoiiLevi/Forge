import { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { cn } from '../../lib/utils';
import { StatusLED } from '../ui/StatusLED';
import { DAGNodeData, getStatusColor } from '../../lib/dag-utils';

export const TaskNode = memo(({ data, selected }: NodeProps<Node<DAGNodeData>>) => {
  const { label, status, type } = data;
  const statusColor = getStatusColor(status);

  return (
    <div
      className={cn(
        "w-[250px] h-[80px] bg-surface border border-border flex flex-col justify-between p-3 relative transition-all duration-200",
        selected && "border-accent ring-1 ring-accent z-10",
        status === 'running' && "animate-pulse-border"
      )}
      role="button"
      tabIndex={0}
      aria-label={`Task ${label}, status ${status}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1 !h-1 !bg-border !border-none"
      />
      
      <div className="flex items-center gap-2 mb-1">
        <StatusLED status={status} size="sm" />
        <span 
          className="font-pixel text-[10px] uppercase text-text-secondary tracking-wider truncate"
          title={type}
        >
          {type}
        </span>
      </div>

      <div 
        className="font-mono text-sm text-text-primary truncate font-medium" 
        title={label}
      >
        {label}
      </div>

      <div 
        className="h-[2px] w-full absolute bottom-0 left-0 transition-all duration-300"
        style={{ 
          backgroundColor: status === 'pending' ? 'transparent' : statusColor,
          opacity: status === 'merged' ? 0.5 : 1
        }} 
      />

      <Handle
        type="source"
        position={Position.Right}
        className="!w-1 !h-1 !bg-border !border-none"
      />
    </div>
  );
});

TaskNode.displayName = 'TaskNode';
