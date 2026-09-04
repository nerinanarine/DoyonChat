import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '../../src/hooks/useChat';
import * as api from '../../src/services/chatApi';
import { AgentApprovalRequest, AgentStreamEvent } from '../../src/types';

vi.mock('../../src/services/chatApi', () => ({
  streamChat: vi.fn(),
  fetchConversationWithMessages: vi.fn(),
  respondAgentApproval: vi.fn(),
}));

interface StreamHandlers {
  onChunk: (chunk: { content?: string; reasoning?: string }) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  options: {
    userMessageId?: string;
    onAgentEvent?: (event: AgentStreamEvent) => void;
    onApproval?: (request: AgentApprovalRequest) => void;
  };
  controller: AbortController;
}

describe('useChat agent approval flow', () => {
  let handlers: StreamHandlers | null;

  beforeEach(() => {
    handlers = null;
    vi.clearAllMocks();
    vi.mocked(api.fetchConversationWithMessages).mockResolvedValue({
      conversation: {} as never,
      messages: [],
    });
    vi.mocked(api.streamChat).mockImplementation(
      (_id, _msg, _img, onChunk, onDone, onError, options) => {
        const controller = new AbortController();
        handlers = {
          onChunk: onChunk ?? (() => {}),
          onDone: onDone ?? (() => {}),
          onError: onError ?? (() => {}),
          options: options ?? {},
          controller,
        };
        return controller;
      },
    );
  });

  it('opens the approval dialog on an approval request and approves it', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('調査して');
    });

    const request: AgentApprovalRequest = {
      id: 'appr-1',
      runId: 'run-1',
      method: 'confirm',
      title: '確認: write',
      message: 'write a.ts',
    };
    act(() => {
      handlers?.options.onApproval?.(request);
    });
    expect(result.current.approvalRequest).toEqual(request);
    expect(result.current.approvalBusy).toBe(false);

    act(() => {
      void result.current.respondApproval(true);
    });
    expect(result.current.approvalRequest).toBeNull();
    expect(result.current.approvalBusy).toBe(true);

    await waitFor(() => expect(api.respondAgentApproval).toHaveBeenCalledWith({
      approvalId: 'appr-1',
      runId: 'run-1',
      approved: true,
    }));
    expect(result.current.agentProgress).toEqual(
      expect.arrayContaining([
        { kind: 'approval_request' },
        { kind: 'approval_resolved', approved: true },
      ]),
    );
    await waitFor(() => expect(result.current.approvalBusy).toBe(false));
  });

  it('rejects the tool and closes the dialog with a reject marker', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('調査して');
    });

    act(() => {
      handlers?.options.onApproval?.({
        id: 'appr-1',
        runId: 'run-1',
        method: 'confirm',
        title: '確認: bash',
        message: 'bash rm',
      });
    });
    act(() => {
      void result.current.respondApproval(false);
    });

    expect(result.current.approvalRequest).toBeNull();
    await waitFor(() =>
      expect(api.respondAgentApproval).toHaveBeenCalledWith({
        approvalId: 'appr-1',
        runId: 'run-1',
        approved: false,
      }),
    );
    expect(result.current.agentProgress).toEqual(
      expect.arrayContaining([{ kind: 'approval_resolved', approved: false }]),
    );
  });

  it('closes the dialog when the approval times out (expired)', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('調査して');
    });

    act(() => {
      handlers?.options.onApproval?.({
        id: 'appr-1',
        runId: 'run-1',
        method: 'confirm',
        title: '確認: write',
        message: 'write a.ts',
      });
    });
    expect(result.current.approvalRequest).not.toBeNull();

    act(() => {
      handlers?.options.onApproval?.({ id: 'appr-1', runId: 'run-1', method: 'confirm', expired: true });
    });
    expect(result.current.approvalRequest).toBeNull();
  });

  it('closes the dialog on stream completion and reloads persisted history', async () => {
    vi.mocked(api.fetchConversationWithMessages).mockResolvedValue({
      conversation: {} as never,
      messages: [{ id: 'saved', conversationId: 'conversation-1', role: 'assistant', content: '最終回答', createdAt: '2026-09-03T00:00:00.000Z' }],
    });
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('調査して');
    });
    act(() => {
      handlers?.options.onApproval?.({
        id: 'appr-1',
        runId: 'run-1',
        method: 'confirm',
        title: '確認: write',
      });
    });
    expect(result.current.approvalRequest).not.toBeNull();

    act(() => {
      handlers?.onDone();
    });
    expect(result.current.approvalRequest).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    await waitFor(() =>
      expect(result.current.messages).toEqual([
        expect.objectContaining({ id: 'saved', content: '最終回答' }),
      ]),
    );
  });

  it('closes the dialog when the user stops the stream', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('調査して');
    });
    act(() => {
      handlers?.options.onApproval?.({
        id: 'appr-1',
        runId: 'run-1',
        method: 'confirm',
        title: '確認: write',
      });
    });
    expect(result.current.approvalRequest).not.toBeNull();

    act(() => {
      result.current.stop();
    });
    expect(result.current.approvalRequest).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it('records tool progress events in order', async () => {
    const { result } = renderHook(() => useChat('conversation-1'));
    await act(async () => {
      await result.current.sendMessage('調査して');
    });
    act(() => {
      handlers?.options.onAgentEvent?.({ kind: 'agent_start' });
      handlers?.options.onAgentEvent?.({ kind: 'tool_start', toolName: 'read' });
      handlers?.options.onAgentEvent?.({ kind: 'tool_end', toolName: 'read' });
    });
    expect(result.current.agentProgress).toEqual([
      { kind: 'agent_start' },
      { kind: 'tool_start', toolName: 'read' },
      { kind: 'tool_end', toolName: 'read' },
    ]);
  });
});