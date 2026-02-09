import React from 'react';
import clsx from 'clsx';
import { ToolCallData, ArtifactLink, MessageRole } from './types';
import { ToolCall } from './ToolCall';
import { StatusLED } from '../ui/StatusLED';

interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallData[];
  artifacts?: ArtifactLink[];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
  timestamp,
  isStreaming,
  toolCalls,
  artifacts,
}) => {
  const isCaptain = role === 'captain';

  return (
    <div
      className={clsx(
        'flex w-full mb-6',
        isCaptain ? 'justify-start' : 'justify-end'
      )}
    >
      <div
        className={clsx(
          'max-w-[85%] rounded-lg p-4 relative',
          isCaptain
            ? 'bg-surface border-l-2 border-accent'
            : 'bg-surface-muted text-text'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2 text-xs text-text-muted">
          <span className="font-bold uppercase tracking-wider">
            {isCaptain ? 'Captain' : 'User'}
          </span>
          <span className="font-mono opacity-50">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Content */}
        <div className={clsx("whitespace-pre-wrap font-mono text-sm leading-relaxed", isStreaming && "animate-pulse-subtle")}>
          {content}
          {isStreaming && <span className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse align-middle" />}
        </div>

        {/* Artifacts Created */}
        {artifacts && artifacts.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="text-xs uppercase text-text-muted mb-2 font-bold">Artifacts Created</div>
            <div className="flex flex-wrap gap-2">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="flex items-center gap-2 bg-surface-raised px-2 py-1 rounded text-xs border border-border hover:border-accent cursor-pointer transition-colors"
                >
                  <StatusLED status="done" size="sm" />
                  <span className="font-mono">{artifact.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tool Calls */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-4 space-y-2">
            {toolCalls.map((tool) => (
              <ToolCall key={tool.id} data={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
