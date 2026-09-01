import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '../../src/hooks/useChat';
import * as api from '../../src/services/chatApi';
import { ChatStreamError } from '../../src/services/errorMessages';

vi.mock('../../src/services/chatApi', () => ({
  streamChat: vi.fn(),
  fetchConversationWithMessages: vi.fn(),
}));

interface StreamHandlers {
  onChunk: (chunk: { content?: string; reasoning?: string }) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  options: { userMessageId?: string };
}

describe('useChat stop and retry', () => {
  let handlers: StreamHandlers | null;

  beforeEach(() => {
    handlers = null;
    vi.clearAllMocks();
    vi.mocked(api.streamChat).mockImplementation(
      (_id, _msg, _img, onChunk, onDone, onError, options) => {
        handlers = {
          onChunk: onChunk ?? (() => {}),
          onDone: onDone ?? (() => {}),
          onError: onError ?? (() => {}),
          options: options ?? {},
        };
        return new AbortController();
      },
    );
  });

  it('keeps the received content and reasoning as a local partial message on stop', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    act(() => {
      handlers?.onChunk({ content: 'partial ', reasoning: 'thinking' });
      handlers?.onChunk({ content: 'answer' });
    });
    act(() => {
      result.current.stop();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'partial answer', reasoning: 'thinking' }),
    ]);
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it('records the interrupted marker when stopping before any content', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: '(生成が中断されました)' }),
    ]);
  });

  it('shows a safe user-facing message and no error assistant message on failure', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    act(() => {
      handlers?.onError(new ChatStreamError('rate_limit'));
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBe(
      'リクエストが多すぎます。しばらく待ってから再試行してください。',
    );
    expect(result.current.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
  });

  it('retries with the same userMessageId without appending another user message', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });
    const firstOptions = handlers?.options.userMessageId;

    act(() => {
      handlers?.onError(new Error('boom'));
    });
    act(() => {
      result.current.retrySend();
    });

    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(2);
    const { userMessageId: secondId } = handlers?.options ?? {};
    expect(secondId).toBe(firstOptions);
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('does not retry after the user stopped the stream', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });
    act(() => {
      result.current.stop();
    });
    vi.mocked(api.streamChat).mockClear();

    act(() => {
      result.current.retrySend();
    });
    expect(vi.mocked(api.streamChat)).not.toHaveBeenCalled();
  });

  it('reloads the persisted history after stopping the stream', async () => {
    vi.mocked(api.fetchConversationWithMessages).mockResolvedValue({
      conversation: {} as never,
      messages: [
        {
          id: 'saved-partial',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: 'saved partial',
          createdAt: '2026-08-31T00:00:00.000Z',
        },
      ],
    });
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });
    act(() => {
      handlers?.onChunk({ content: 'partial' });
      result.current.stop();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    expect(api.fetchConversationWithMessages).toHaveBeenCalledWith('conversation-1');
    await waitFor(() =>
      expect(result.current.messages).toEqual([
        expect.objectContaining({ id: 'saved-partial', content: 'saved partial' }),
      ]),
    );
  });
});

describe('useChat message loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks messagesLoading while fetching and clears it afterwards', async () => {
    vi.mocked(api.fetchConversationWithMessages).mockResolvedValue({
      conversation: {} as never,
      messages: [
        {
          id: 'm1',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: 'saved message',
          createdAt: '2026-08-22T00:00:00.000Z',
        },
      ],
    });
    const { result } = renderHook(() => useChat('conversation-1'));

    act(() => {
      void result.current.loadMessages('conversation-1');
    });
    expect(result.current.messagesLoading).toBe(true);

    await waitFor(() => expect(result.current.messagesLoading).toBe(false));
    expect(result.current.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'saved message' })]),
    );
  });
});