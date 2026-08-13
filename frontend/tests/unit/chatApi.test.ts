import { describe, expect, it, vi, beforeEach } from 'vitest';
import { streamChat } from '../../src/services/chatApi';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function streamingResponse(...chunks: string[]) {
  let index = 0;
  const reader = {
    read: vi.fn(async () => {
      if (index < chunks.length) {
        return { done: false, value: new TextEncoder().encode(chunks[index++]) };
      }
      return { done: true, value: undefined };
    }),
  };

  return { ok: true, body: { getReader: () => reader } };
}

describe('chat stream API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('passes reasoning and content separately and completes once', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"content":"","reasoning":"思考',
        '中","done":false}\n\ndata: {"content":"回答","done":false}\n\n' +
          'data: {"content":"","done":true}\n\n',
      ),
    );

    const chunks: unknown[] = [];
    const errors: Error[] = [];
    const done = new Promise<void>((resolve, reject) => {
      streamChat(
        'conversation-1',
        '質問',
        undefined,
        (chunk) => chunks.push(chunk),
        resolve,
        (error) => {
          errors.push(error);
          reject(error);
        },
      );
    });

    await done;

    expect(chunks).toEqual([
      { content: '', reasoning: '思考中' },
      { content: '回答', reasoning: '' },
    ]);
    expect(errors).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
