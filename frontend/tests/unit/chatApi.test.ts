import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  autoGenerateTitle,
  streamChat,
  updateConversationTitle,
  fetchUserSettings,
  updateUserSettings,
} from '../../src/services/chatApi';

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

  it('sends the client userMessageId so retries are idempotent server-side', () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse('data: {"content":"","done":true}\n\n'),
    );

    const done = new Promise<void>((resolve) => {
      streamChat(
        'conversation-1',
        '質問',
        undefined,
        undefined,
        resolve,
        undefined,
        { userMessageId: 'client-id-1' },
      );
    });

    return done.then(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.objectContaining({
          body: JSON.stringify({
            conversationId: 'conversation-1',
            message: '質問',
            imageBase64: undefined,
            userMessageId: 'client-id-1',
          }),
        }),
      );
    });
  });

  it('notifies onError without onDone when a safe SSE error event arrives', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"content":"partial","done":false}\n\n' +
          'data: {"error":{"code":"rate_limit"}}\n\n',
      ),
    );

    const chunks: unknown[] = [];
    let doneCount = 0;
    const errors: Error[] = [];
    await new Promise<void>((resolve) => {
      streamChat(
        'conversation-1',
        '質問',
        undefined,
        (chunk) => chunks.push(chunk),
        () => {
          doneCount += 1;
        },
        (error) => {
          errors.push(error);
          resolve();
        },
      );
    });

    expect(chunks).toEqual([{ content: 'partial', reasoning: '' }]);
    expect(errors[0]).toMatchObject({ name: 'ChatStreamError', code: 'rate_limit' });
    expect(doneCount).toBe(0);
  });

  it('maps an HTTP 429 response to a rate limit stream error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, body: null });

    const errors: Error[] = [];
    await new Promise<void>((resolve) => {
      streamChat(
        'conversation-1',
        '質問',
        undefined,
        undefined,
        undefined,
        (error) => {
          errors.push(error);
          resolve();
        },
      );
    });

    expect(errors[0]).toMatchObject({ name: 'ChatStreamError', code: 'rate_limit' });
  });

  it('does not call onError when the stream is aborted by the user', async () => {
    const reader = {
      read: vi.fn(async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }),
    };
    mockFetch.mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } });

    const errors: Error[] = [];
    let doneCount = 0;
    const controller = streamChat(
      'conversation-1',
      '質問',
      undefined,
      undefined,
      () => {
        doneCount += 1;
      },
      (error) => {
        errors.push(error);
      },
    );
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toHaveLength(0);
    expect(doneCount).toBe(0);
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

  it('posts the first message text to the auto title endpoint', async () => {
    const updated = {
      id: 'conversation-1',
      title: 'AI生成タイトル',
      model: 'model-1',
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(updated),
    });

    await expect(autoGenerateTitle('conversation-1', 'こんにちは')).resolves.toEqual(updated);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conversation-1/title/auto'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'こんにちは' }),
      }),
    );
  });
});

describe('user settings API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches user settings from the settings endpoint', async () => {
    const response = {
      userId: 'alice',
      settings: { defaultModel: 'kimi-k2.6' },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response),
    });

    await expect(fetchUserSettings()).resolves.toEqual(response);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/me/settings'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('patches user settings including a null clear', async () => {
    const response = { userId: 'alice', settings: {} };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response),
    });

    await expect(updateUserSettings({ defaultModel: null })).resolves.toEqual(response);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/me/settings'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ defaultModel: null }),
      }),
    );
  });
});
