import { Run, Task, ChangeRequest, CreateRunOptions, StreamOptions } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ForgeAPIError extends Error {
  constructor(public status: number, public statusText: string, message?: string) {
    super(message || `API Error: ${status} ${statusText}`);
    this.name = 'ForgeAPIError';
  }
}

export class ForgeClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      throw new ForgeAPIError(response.status, response.statusText);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Runs
  async createRun(repoUrl: string, options?: CreateRunOptions): Promise<Run> {
    return this.request<Run>('/runs', {
      method: 'POST',
      body: JSON.stringify({ repoUrl, ...options }),
    });
  }

  async getRun(runId: string): Promise<Run> {
    return this.request<Run>(`/runs/${runId}`);
  }

  async pauseRun(runId: string): Promise<void> {
    return this.request<void>(`/runs/${runId}/pause`, { method: 'POST' });
  }

  async resumeRun(runId: string): Promise<void> {
    return this.request<void>(`/runs/${runId}/resume`, { method: 'POST' });
  }

  // Stream URL helper (actual streaming handled by EventStreamHandler)
  getStreamUrl(runId: string, options?: StreamOptions): string {
    const params = new URLSearchParams();
    if (options?.after) {
      params.append('after', options.after);
    }
    const queryString = params.toString();
    return `${this.baseUrl}/runs/${runId}/stream${queryString ? `?${queryString}` : ''}`;
  }

  // Captain
  async sendCaptainMessage(runId: string, message: string): Promise<void> {
    return this.request<void>('/captain/message', {
      method: 'POST',
      body: JSON.stringify({ runId, message }),
    });
  }

  // Tasks
  async listTasks(runId: string): Promise<Task[]> {
    return this.request<Task[]>(`/runs/${runId}/tasks`);
  }

  async getTask(runId: string, taskId: string): Promise<Task> {
    return this.request<Task>(`/runs/${runId}/tasks/${taskId}`);
  }

  // Artifacts
  async getArtifact(runId: string, path: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/runs/${runId}/artifacts/${path}`);
    if (!response.ok) {
        throw new ForgeAPIError(response.status, response.statusText);
    }
    return response.text();
  }

  // Change Requests
  async listChangeRequests(runId: string): Promise<ChangeRequest[]> {
    return this.request<ChangeRequest[]>(`/runs/${runId}/change-requests`);
  }

  async approveChangeRequest(runId: string, crId: string): Promise<void> {
    return this.request<void>(`/runs/${runId}/change-requests/${crId}/approve`, {
      method: 'POST',
    });
  }
}

export const forgeClient = new ForgeClient();
