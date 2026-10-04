import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '../../src/hooks/useChat';
import * as api from '../../src/services/chatApi';
import { ApiError } from '../../src/services/api';
import { ChatStreamError } from '../../src/services/errorMessages';
import { AgentApprovalRequest, AgentStreamEvent } from '../../src/types';

vi.mock('../../src/services/chatApi', () => ({
  streamChat: vi.fn(),
  fetchConversationWithMessages: vi.fn(),
  respondAgentApproval: vi.fn(),
  fetchAgentModels: vi.fn(),
}));

interface StreamHandlers {
  onError: (error: Error) => void;
  options: {
    userMessageId?: string;
    onApproval?: (request: AgentApprovalRequest) => void;
    onAgentEvent?: (event: AgentStreamEvent) => void;
  };
}

describe('useChat gateway cold-start (P2-018)', () => {
  let handlers: StreamHandlers | null;

  beforeEach(() => {
    vi.useFakeTimers();
    handlers = null;
    vi.clearAllMocks();
    vi.mocked(api.fetchConversationWithMessages).mockResolvedValue({
      conversation: {} as never,
      messages: [],
    });
    vi.mocked(api.fetchAgentModels).mockResolvedValue({ models: [] });
    vi.mocked(api.respondAgentApproval).mockResolvedValue(undefined);
    vi.mocked(api.streamChat).mockImplementation(
      (_id, _msg, _onChunk, _onDone, onError, options) => {
        handlers = {
          onError: onError ?? (() => {}),
          options: options ?? {},
        };
        return new AbortController();
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function sendAndColdStart() {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });
    // 送信がコールドスタートで失敗したことを通知する（中継の専用 SSE コード）
    act(() => {
      handlers?.onError(new ChatStreamError('agent-starting'));
    });
    return result;
  }

  it('shows startup loading, polls every 5s, and auto-retries the send once ready', async () => {
    const result = await sendAndColdStart();
    expect(result.current.agentStarting).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);

    // 1 回目のポーリング（5 秒後）でも未起動 → 継続ポーリング（エラーUIへは行かない）
    vi.mocked(api.fetchAgentModels).mockRejectedValueOnce(
      new ApiError(503, '{"error":"Agent service unavailable"}'),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.agentStarting).toBe(true);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);

    // 2 回目のポーリングで起動完了 → 自動再送
    vi.mocked(api.fetchAgentModels).mockResolvedValueOnce({ models: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.agentStarting).toBe(false);
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(2);
    // 再送は同一 userMessageId で、ユーザーメッセージは重複しない
    expect(handlers?.options.userMessageId).toBeDefined();
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('keeps polling on transient 5xx/timeout without showing an error', async () => {
    const result = await sendAndColdStart();

    vi.mocked(api.fetchAgentModels).mockRejectedValue(new ApiError(502, 'Agent service error'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    // タイムアウト系（非 ApiError）も継続対象
    vi.mocked(api.fetchAgentModels).mockRejectedValue(new Error('TimeoutError'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.agentStarting).toBe(true);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(api.fetchAgentModels)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it('transitions to the error UI with retry after the total 300s startup timeout', async () => {
    const result = await sendAndColdStart();

    vi.mocked(api.fetchAgentModels).mockRejectedValue(
      new ApiError(503, '{"error":"Agent service unavailable"}'),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    expect(result.current.agentStarting).toBe(false);
    expect(result.current.error).toBe(
      'エージェントサービスの起動に時間がかかっています。再試行してください。',
    );

    // エラーUIの再試行で送信を再実行する
    vi.mocked(api.streamChat).mockClear();
    act(() => {
      result.current.retry();
    });
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it('transitions to the error UI immediately on an explicit config error', async () => {
    const result = await sendAndColdStart();

    vi.mocked(api.fetchAgentModels).mockRejectedValueOnce(
      new ApiError(404, '{"error":"Agent feature is not available"}'),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.agentStarting).toBe(false);
    expect(result.current.error).toBe(
      'エージェントサービスを起動できませんでした。再試行してください。',
    );
  });

  it('transitions to the error UI immediately on a config-error 503 without polling', async () => {
    const result = await sendAndColdStart();

    vi.mocked(api.fetchAgentModels).mockRejectedValue(
      new ApiError(503, '{"error":"Agent service is not configured"}'),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.agentStarting).toBe(false);
    expect(result.current.error).toBe(
      'エージェントサービスを起動できませんでした。再試行してください。',
    );
    expect(vi.mocked(api.fetchAgentModels)).toHaveBeenCalledTimes(1);

    // ポーリングは継続しない（300 秒待っても再確認しない）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(vi.mocked(api.fetchAgentModels)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it('maps an approve 503 cold-start to startup loading and re-submits the approval once ready', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('hello');
    });
    act(() => {
      handlers?.options.onApproval?.({ id: 'appr-1', runId: 'run-1', method: 'confirm' });
    });

    vi.mocked(api.respondAgentApproval).mockRejectedValueOnce(
      new ApiError(503, '{"error":"Agent service unavailable"}'),
    );
    await act(async () => {
      await result.current.respondApproval(true);
    });

    expect(result.current.agentStarting).toBe(true);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(api.respondAgentApproval)).toHaveBeenCalledTimes(1);

    // 起動完了 → 承認を自動再送
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.agentStarting).toBe(false);
    expect(vi.mocked(api.respondAgentApproval)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.respondAgentApproval)).toHaveBeenLastCalledWith({
      approvalId: 'appr-1',
      runId: 'run-1',
      approved: true,
    });
  });
});
