import { randomUUID } from 'node:crypto';

export type EventType =
  // Run lifecycle
  | 'run.started'
  | 'run.paused'
  | 'run.completed'
  // Captain (planning phase)
  | 'captain.message'
  | 'captain.tool_call'
  | 'captain.tool_result'
  | 'plan.finalized'
  // Task lifecycle
  | 'task.scheduled'
  | 'task.started'
  | 'task.heartbeat'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  // Agent tool calls
  | 'tool.call'
  | 'tool.result'
  // Artifacts & branches
  | 'artifact.written'
  | 'branch.pushed'
  // Refinery
  | 'refinery.started'
  | 'refinery.merged'
  // Change requests
  | 'cr.emitted';

export interface ForgeEvent {
  eventId: string;
  seq: number;
  timestamp: string;
  type: EventType;
  runId: string;
  taskId?: string;
  attemptId?: string;
  data: Record<string, unknown>;
}

export type ForgeEventInput = Omit<ForgeEvent, 'eventId' | 'seq' | 'timestamp'> & {
  /** Optional override, mainly for tests. Defaults to `new Date().toISOString()` */
  timestamp?: string;
};

type Subscriber = (event: ForgeEvent) => void;

class RingBuffer {
  private readonly capacity: number;
  private start = 0;
  private size = 0;
  private readonly slots: (ForgeEvent | undefined)[];
  private readonly seqByEventId = new Map<string, number>();

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.slots = Array.from({ length: capacity });
  }

  append(event: ForgeEvent): void {
    const idx = (this.start + this.size) % this.capacity;
    const evicted = this.slots[idx];
    if (evicted) {
      this.seqByEventId.delete(evicted.eventId);
    }

    this.slots[idx] = event;
    this.seqByEventId.set(event.eventId, event.seq);

    if (this.size < this.capacity) {
      this.size += 1;
      return;
    }

    // Overwrite oldest.
    this.start = (this.start + 1) % this.capacity;
  }

  toArrayOldestFirst(): ForgeEvent[] {
    const out: ForgeEvent[] = [];
    for (let i = 0; i < this.size; i += 1) {
      const idx = (this.start + i) % this.capacity;
      const e = this.slots[idx];
      if (e) out.push(e);
    }
    return out;
  }

  seqForEventId(eventId: string): number | undefined {
    return this.seqByEventId.get(eventId);
  }

  clear(): void {
    this.start = 0;
    this.size = 0;
    this.seqByEventId.clear();
    this.slots.fill(undefined);
  }
}

type RunStreamState = {
  nextSeq: number;
  buffer: RingBuffer;
  subscribers: Set<Subscriber>;
  gcTimer?: NodeJS.Timeout;
};

export class EventHub {
  private readonly maxEventsPerRun: number;
  private readonly completedRunRetentionMs: number;
  private readonly runs = new Map<string, RunStreamState>();

  constructor(options?: { maxEventsPerRun?: number; completedRunRetentionMs?: number }) {
    this.maxEventsPerRun = options?.maxEventsPerRun ?? 10_000;
    this.completedRunRetentionMs = options?.completedRunRetentionMs ?? 60 * 60 * 1000;
  }

  private stateFor(runId: string): RunStreamState {
    const existing = this.runs.get(runId);
    if (existing) return existing;

    const created: RunStreamState = {
      nextSeq: 1,
      buffer: new RingBuffer(this.maxEventsPerRun),
      subscribers: new Set(),
    };
    this.runs.set(runId, created);
    return created;
  }

  emit(input: ForgeEventInput): ForgeEvent {
    const st = this.stateFor(input.runId);

    // Cancel any scheduled GC if the run becomes active again.
    if (st.gcTimer) {
      clearTimeout(st.gcTimer);
      st.gcTimer = undefined;
    }

    const event: ForgeEvent = {
      eventId: `evt_${randomUUID()}`,
      seq: st.nextSeq,
      timestamp: input.timestamp ?? new Date().toISOString(),
      type: input.type,
      runId: input.runId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      data: input.data,
    };

    st.nextSeq += 1;
    st.buffer.append(event);

    // Deliver to subscribers best-effort (never break event emission).
    for (const sub of st.subscribers) {
      try {
        sub(event);
      } catch {
        // ignore
      }
    }

    if (event.type === 'run.completed') {
      st.gcTimer = setTimeout(() => {
        const current = this.runs.get(input.runId);
        if (!current) return;
        current.buffer.clear();
        this.runs.delete(input.runId);
      }, this.completedRunRetentionMs);
    }

    return event;
  }

  /** Returns buffered events for `runId` after the provided `eventId` (exclusive). */
  getAfter(runId: string, afterEventId?: string): ForgeEvent[] {
    const st = this.runs.get(runId);
    if (!st) return [];

    const all = st.buffer.toArrayOldestFirst();
    if (!afterEventId) return all;

    const afterSeq = st.buffer.seqForEventId(afterEventId);
    if (afterSeq === undefined) {
      // If the client asks for an event that fell out of the in-memory buffer,
      // fall back to replaying the entire buffer (client can dedupe by eventId).
      return all;
    }

    return all.filter((e) => e.seq > afterSeq);
  }

  subscribe(runId: string, fn: Subscriber): () => void {
    const st = this.stateFor(runId);
    st.subscribers.add(fn);
    return () => {
      st.subscribers.delete(fn);
    };
  }

  clear(runId: string): void {
    const st = this.runs.get(runId);
    if (!st) return;
    if (st.gcTimer) clearTimeout(st.gcTimer);
    st.buffer.clear();
    this.runs.delete(runId);
  }
}
