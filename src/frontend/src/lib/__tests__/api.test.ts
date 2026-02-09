import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgeClient, ForgeAPIError } from '../api';

global.fetch = vi.fn();

describe('ForgeClient', () => {
  let client: ForgeClient;

  beforeEach(() => {
    client = new ForgeClient('http://test-api');
    vi.clearAllMocks();
  });

  it('createRun makes a POST request', async () => {
    const mockResponse = { runId: 'run-1', status: 'pending' };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.createRun('http://github.com/test/repo');
    
    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-api/runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ repoUrl: 'http://github.com/test/repo' }),
      })
    );
    expect(result).toEqual(mockResponse);
  });

  it('getRun makes a GET request', async () => {
    const mockResponse = { runId: 'run-1', status: 'pending' };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.getRun('run-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-api/runs/run-1',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
    );
    expect(result).toEqual(mockResponse);
  });

  it('throws ForgeAPIError on non-ok response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(client.getRun('invalid-id')).rejects.toThrow(ForgeAPIError);
  });

  it('getStreamUrl constructs correct URL with query params', () => {
    const url = client.getStreamUrl('run-1', { after: 'evt-123' });
    expect(url).toBe('http://test-api/runs/run-1/stream?after=evt-123');
  });
});
