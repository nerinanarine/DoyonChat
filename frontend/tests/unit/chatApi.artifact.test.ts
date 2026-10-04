import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadArtifact } from '../../src/services/chatApi';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('downloadArtifact', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('requests the owner-scoped endpoint without an auth header when auth is disabled', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => new Blob(['data']),
    });

    const blob = await downloadArtifact('user-a', 'report.pdf');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent/artifacts/user-a/report.pdf'),
      { method: 'GET', headers: {} },
    );
    expect(blob).toBeInstanceOf(Blob);
  });

  it('throws an ApiError with the status when the download fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(downloadArtifact('user-a', 'missing.txt')).rejects.toMatchObject({ status: 404 });
  });
});
