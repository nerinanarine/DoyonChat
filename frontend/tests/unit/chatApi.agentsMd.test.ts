import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAgentsMd, updateAgentsMd } from '../../src/services/chatApi';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('user AGENTS.md API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches the current AGENTS.md from the agents-md endpoint', async () => {
    const response = { userId: 'alice', content: '# 指示' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response),
    });

    await expect(fetchAgentsMd()).resolves.toEqual(response);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/me/agents-md'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns null when unset (404) instead of throwing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue('AGENTS.md not found'),
    });

    await expect(fetchAgentsMd()).resolves.toBeNull();
  });

  it('rethrows non-404 failures', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('boom'),
    });

    await expect(fetchAgentsMd()).rejects.toMatchObject({ status: 500 });
  });

  it('patches content and sends an empty string to clear', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ userId: 'alice', content: '# 新' }),
    });
    await expect(updateAgentsMd('# 新')).resolves.toEqual({ userId: 'alice', content: '# 新' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/me/agents-md'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ content: '# 新' }),
      }),
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ userId: 'alice', content: '' }),
    });
    await expect(updateAgentsMd('')).resolves.toEqual({ userId: 'alice', content: '' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/me/agents-md'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ content: '' }),
      }),
    );
  });
});
