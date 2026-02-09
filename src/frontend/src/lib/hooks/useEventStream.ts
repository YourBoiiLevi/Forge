import { useState, useEffect, useRef, useCallback } from 'react';
import { forgeClient } from '../api';
import { ForgeEvent } from '../types';

// Using a custom event parsing logic for NDJSON
// This handles partial chunks and complete lines
class NDJSONParser {
  private buffer: string = '';

  parse(chunk: string): ForgeEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    
    // The last part might be incomplete, keep it in the buffer
    this.buffer = lines.pop() || '';

    const events: ForgeEvent[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Skip comments (keepalive)
      if (line.startsWith(':')) continue;

      try {
        const event = JSON.parse(line) as ForgeEvent;
        events.push(event);
      } catch (e) {
        console.warn('Failed to parse NDJSON line:', line, e);
      }
    }
    return events;
  }
}

export function useEventStream(runId: string | null) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [events, setEvents] = useState<ForgeEvent[]>([]);
  const [lastEventId, setLastEventId] = useState<string | undefined>(undefined);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const connect = useCallback(() => {
    if (!runId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const parser = new NDJSONParser();

    setStatus('connecting');

    const streamUrl = forgeClient.getStreamUrl(runId, { after: lastEventId });

    fetch(streamUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Stream error: ${response.status}`);
        }
        
        if (!response.body) {
           throw new Error('ReadableStream not supported');
        }

        setStatus('connected');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const newEvents = parser.parse(chunk);
          
          if (newEvents.length > 0) {
            setEvents((prev) => [...prev, ...newEvents]);
            setLastEventId(newEvents[newEvents.length - 1].eventId);
          }
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        
        console.error('Stream connection failed:', err);
        setStatus('error');
        
        // Retry logic with exponential backoff could go here
        // For now, simple retry after 3s
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      });

  }, [runId, lastEventId]);

  useEffect(() => {
    if (runId) {
      connect();
    } else {
        setStatus('disconnected');
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [runId, connect]);

  return { status, events, isConnected: status === 'connected' };
}
