import { describe, expect, it, vi, beforeEach } from 'vitest';
import { streamChat, updateConversationTitle } from '../../src/services/chatApi';

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

describe('conversation title API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends a trimmed title to the title endpoint', async () => {
    const updated = {
      id: 'conversation-1',
      title: '新しいタイトル',
      model: 'model-1',
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(updated),
    });

    await expect(updateConversationTitle('conversation-1', '  新しいタイトル  ')).resolves.toEqual(
      updated,
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conversation-1/title'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ title: '新しいタイトル' }),
      }),
    );
  });
});
