import { healthCheck, streamChat } from '../../src/services/opencodeGo';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

function streamingResponse(...events: string[]) {
  let index = 0;
  const reader = {
    read: jest.fn(async () => {
      if (index < events.length) {
        return { done: false, value: new TextEncoder().encode(events[index++]) };
      }
      return { done: true, value: undefined };
    }),
    releaseLock: jest.fn(),
  };

  return { ok: true, body: { getReader: () => reader } };
}

async function collectStream(model: string) {
  const chunks = [];
  for await (const chunk of streamChat([{ role: 'user', content: 'ping' }], { model })) {
    chunks.push(chunk);
  }
  return chunks;
}

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

    it('should use the Responses API for Grok 4.5', async () => {
      process.env.OPENCODE_GO_MODEL = 'grok-4.5';
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://opencode.ai/zen/go/v1/responses',
        expect.objectContaining({
          body: expect.stringContaining('"max_output_tokens":1'),
        }),
      );
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody).toEqual({
        model: 'grok-4.5',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
        max_output_tokens: 1,
      });
    });
  });

  describe('streamChat', () => {
    it('uses Responses API streaming events for Grok 4.5', async () => {
      mockFetch.mockResolvedValueOnce(
        streamingResponse(
          'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n' +
            'data: {"type":"response.output_text.delta","delta":" Grok"}\n\n' +
            'data: {"type":"response.completed"}\n\n',
        ),
      );

      const chunks = await collectStream('grok-4.5');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://opencode.ai/zen/go/v1/responses',
        expect.objectContaining({ method: 'POST' }),
      );
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody).toEqual({
        model: 'grok-4.5',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
        stream: true,
        max_output_tokens: 4096,
      });
      expect(chunks).toEqual([
        { content: 'Hello', done: false },
        { content: ' Grok', done: false },
        { content: '', done: true },
      ]);
    });

    it('keeps Chat Completions for non-Grok models', async () => {
      mockFetch.mockResolvedValueOnce(
        streamingResponse('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
      );

      const chunks = await collectStream('kimi-k2.6');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://opencode.ai/zen/go/v1/chat/completions',
        expect.objectContaining({ method: 'POST' }),
      );
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe('kimi-k2.6');
      expect(requestBody.messages).toEqual([{ role: 'user', content: 'ping' }]);
      expect(requestBody.max_tokens).toBe(4096);
      expect(chunks).toEqual([
        { content: 'Hello', done: false },
        { content: '', done: true },
      ]);
    });

    it('surfaces Responses API failure events', async () => {
      mockFetch.mockResolvedValueOnce(
        streamingResponse(
          'data: {"type":"response.failed","error":{"message":"model unavailable"}}\n\n',
        ),
      );

      await expect(collectStream('grok-4.5')).rejects.toThrow('model unavailable');
    });
  });
});
