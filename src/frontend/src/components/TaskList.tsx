import { useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import { Task } from '../lib/types';
import { StatusLED, StatusType } from './ui/StatusLED';
import { useNavigate } from 'react-router-dom';

interface TaskListProps {
  tasks: Task[];
  className?: string;
  onTaskClick?: (taskId: string) => void;
}

type SortField = 'status' | 'taskId' | 'title' | 'type' | 'agentId' | 'dependencies';
type SortDirection = 'asc' | 'desc';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

export function TaskList({ tasks, className, onTaskClick }: TaskListProps) {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'taskId', direction: 'asc' });

  const handleSort = (field: SortField) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          task.taskId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [tasks, filterStatus, searchQuery]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let aValue: string | number = (a[fieldToProp(sort.field)] as unknown) as string | number;
      let bValue: string | number = (b[fieldToProp(sort.field)] as unknown) as string | number;
      
      if (sort.field === 'dependencies') {
        aValue = a.dependencies.length;
        bValue = b.dependencies.length;
      }

      // Handle null/undefined
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      if (aValue < bValue) return sort.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTasks, sort]);

  const handleRowClick = (taskId: string) => {
    if (onTaskClick) {
      onTaskClick(taskId);
    } else {
      navigate(`/tasks/${taskId}`);
    }
  };

  return (
    <div className={cn("flex flex-col gap-4 font-mono text-sm", className)}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-zinc-500 uppercase text-xs">Filter Status:</label>
          <select 
            id="status-filter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-sm px-2 py-1 focus:border-orange-500 focus:outline-none"
          >
            <option value="all">ALL</option>
            <option value="pending">PENDING</option>
            <option value="running">RUNNING</option>
            <option value="done">DONE</option>
            <option value="failed">FAILED</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1">
          <label htmlFor="search" className="text-zinc-500 uppercase text-xs">Search:</label>
          <input
            id="search"
            type="text"
            placeholder="Search by title or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-sm px-2 py-1 w-full max-w-xs focus:border-orange-500 focus:outline-none placeholder:text-zinc-700"
          />
        </div>

        {(filterStatus !== 'all' || searchQuery) && (
          <button 
            onClick={() => { setFilterStatus('all'); setSearchQuery(''); }}
            className="text-orange-500 hover:text-orange-400 text-xs uppercase"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 uppercase text-xs border-b border-zinc-800">
              <SortableHeader label="St" field="status" currentSort={sort} onSort={handleSort} className="w-10 text-center" />
              <SortableHeader label="ID" field="taskId" currentSort={sort} onSort={handleSort} className="w-24" />
              <SortableHeader label="Title" field="title" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Type" field="type" currentSort={sort} onSort={handleSort} className="w-32" />
              <SortableHeader label="Agent" field="agentId" currentSort={sort} onSort={handleSort} className="w-32" />
              <SortableHeader label="Deps" field="dependencies" currentSort={sort} onSort={handleSort} className="w-16 text-center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 bg-zinc-950">
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-600 italic">
                  No tasks found matching your filters.
                </td>
              </tr>
            ) : (
              sortedTasks.map(task => (
                <tr 
                  key={task.taskId} 
                  onClick={() => handleRowClick(task.taskId)}
                  className="hover:bg-zinc-900/50 cursor-pointer transition-colors group"
                >
                  <td className="p-3 text-center">
                    <div className="flex justify-center">
                      <StatusLED status={task.status as StatusType} size="sm" />
                    </div>
                  </td>
                  <td className="p-3 text-zinc-500 group-hover:text-zinc-300 font-mono text-xs">{task.taskId.slice(0, 8)}</td>
                  <td className="p-3 text-zinc-300 font-medium truncate max-w-md" title={task.title}>
                    {task.title}
                  </td>
                  <td className="p-3 text-zinc-400 text-xs">{task.type}</td>
                  <td className="p-3 text-zinc-400 text-xs">{task.agentId || '-'}</td>
                  <td className="p-3 text-center text-zinc-500 text-xs">{task.dependencies.length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="text-right text-xs text-zinc-600">
        Showing {sortedTasks.length} of {tasks.length} tasks
      </div>
    </div>
  );
}

function fieldToProp(field: SortField): keyof Task {
  if (field === 'dependencies') return 'dependencies'; // Special handling in sort
  return field;
}

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortState;
  onSort: (field: SortField) => void;
  className?: string;
}

function SortableHeader({ label, field, currentSort, onSort, className }: SortableHeaderProps) {
  const isActive = currentSort.field === field;
  return (
    <th 
      className={cn(
        "p-3 font-normal cursor-pointer select-none hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors", 
        isActive && "text-orange-500 hover:text-orange-400 bg-zinc-900",
        className
      )}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1 justify-center md:justify-start">
        {label}
        {isActive && (
          <span className="text-[10px]">
            {currentSort.direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </div>
    </th>
  );
}
