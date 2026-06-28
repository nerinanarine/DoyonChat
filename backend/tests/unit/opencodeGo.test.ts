import { healthCheck } from '../../src/services/opencodeGo';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OpenCode Go API Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENCODE_GO_API_KEY: 'test-key' };
    mockFetch.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('healthCheck', () => {
    it('should return true when API responds with ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://opencode.ai/zen/go/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        }),
      );
    });

    it('should return false when API responds with error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should return false when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should handle missing API key', async () => {
      process.env.OPENCODE_GO_API_KEY = '';

      const result = await healthCheck();

      expect(result).toBe(false);
    });
  });
});
