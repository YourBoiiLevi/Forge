import React, { useState, useEffect, useRef } from 'react';
import { Message, PlanData } from './types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { PlanReview } from './PlanReview';
import { forgeClient } from '../../lib/api';

interface CaptainChatProps {
  runId: string;
  initialMessages?: Message[];
}

export const CaptainChat: React.FC<CaptainChatProps> = ({ runId, initialMessages = [] }) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isThinking, setIsThinking] = useState(false);
  const [plan, setPlan] = useState<PlanData | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, plan]);

  const handleSendMessage = async (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsThinking(true);

    try {
      await forgeClient.sendCaptainMessage(runId, content);
      // NOTE: In a real implementation, the response would come via the SSE/NDJSON stream
      // handled by useEventStream in the parent or a context. 
      // For this UI implementation, we will simulate a response after a delay
      // if we don't have the live stream hook connected here yet.
      
      // Simulate Captain thinking and responding (mock for UI dev)
      setTimeout(() => {
        setIsThinking(false);
        const responseMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'captain',
            content: "I've received your request. I'm analyzing the requirements now.",
            timestamp: new Date().toISOString(),
            isStreaming: false
        };
        setMessages(prev => [...prev, responseMsg]);
        
        // Simulate Plan creation trigger (mock)
        if (content.toLowerCase().includes('plan')) {
            setPlan({
                id: 'plan-1',
                title: 'Implementation Plan',
                summary: 'Based on your request, here is the plan to move forward.',
                artifacts: {
                    specs: ['specs/feature-x.md'],
                    tasks: ['Task 1: Setup', 'Task 2: Implementation'],
                    dag: 'dag.json'
                }
            });
        }

      }, 1500);

    } catch (error) {
      console.error('Failed to send message:', error);
      setIsThinking(false);
      // Add error message to chat
    }
  };

  const handleApprovePlan = () => {
    // Logic to approve plan
    console.log('Plan approved');
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-text-muted mt-20">
              <h2 className="text-2xl font-bold mb-2 text-text">Captain Interface</h2>
              <p>Describe your task to start the planning phase.</p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              isStreaming={msg.isStreaming}
              toolCalls={msg.toolCalls}
              artifacts={msg.artifacts}
            />
          ))}

          {isThinking && (
            <div className="flex justify-start mb-6 animate-pulse">
              <div className="bg-surface border-l-2 border-accent/50 rounded-lg p-4 text-text-muted text-sm font-mono flex items-center gap-2">
                <span className="w-2 h-2 bg-accent rounded-full animate-bounce" />
                Captain is thinking...
              </div>
            </div>
          )}

          {plan && (
            <PlanReview 
                plan={plan} 
                onApprove={handleApprovePlan}
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <ChatInput 
        onSendMessage={handleSendMessage} 
        disabled={isThinking || !!plan} // Disable input if thinking or plan is pending approval
        placeholder={plan ? "Review the plan above to continue" : "Message the Captain..."}
      />
    </div>
  );
};
