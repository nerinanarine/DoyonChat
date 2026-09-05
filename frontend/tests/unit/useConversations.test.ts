import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversations } from '../../src/hooks/useConversations';
import * as api from '../../src/services/chatApi';
import { Conversation } from '../../src/types';

vi.mock('../../src/services/chatApi', () => ({
  fetchConversations: vi.fn(),
  updateConversationTitle: vi.fn(),
  updateConversationAgentMode: vi.fn(),
  autoGenerateTitle: vi.fn(),
}));

const conversations: Conversation[] = [
  {
    id: 'conversation-1',
    title: '最初の会話',
    model: 'model-1',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T02:00:00.000Z',
  },
  {
    id: 'conversation-2',
    title: '次の会話',
    model: 'model-2',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T01:00:00.000Z',
  },
];

describe('useConversations title update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchConversations).mockResolvedValue(conversations);
  });

  it('replaces only the updated conversation without changing order', async () => {
    const updated = { ...conversations[1], title: '更新後の会話' };
    vi.mocked(api.updateConversationTitle).mockResolvedValue(updated);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    await act(async () => {
      await result.current.updateTitle('conversation-2', '更新後の会話');
    });

    expect(api.updateConversationTitle).toHaveBeenCalledWith('conversation-2', '更新後の会話');
    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual([
      'conversation-1',
      'conversation-2',
    ]);
    expect(result.current.conversations[0]).toBe(conversations[0]);
    expect(result.current.conversations[1]).toBe(updated);
  });

  it('keeps the existing state when the update fails', async () => {
    const error = new Error('update failed');
    vi.mocked(api.updateConversationTitle).mockRejectedValue(error);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    const beforeUpdate = result.current.conversations;
    let thrown: unknown;

    await act(async () => {
      try {
        await result.current.updateTitle('conversation-1', '失敗する更新');
      } catch (caught) {
        thrown = caught;
      }
    });

    expect(thrown).toBe(error);
    expect(result.current.conversations).toBe(beforeUpdate);
    expect(result.current.isRenamed('conversation-1')).toBe(false);
  });
});

describe('useConversations auto title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchConversations).mockResolvedValue(conversations);
  });

  it('tracks a successful manual rename so auto title is skipped later', async () => {
    const updated = { ...conversations[0], title: 'リネーム済み' };
    vi.mocked(api.updateConversationTitle).mockResolvedValue(updated);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    await act(async () => {
      await result.current.updateTitle('conversation-1', 'リネーム済み');
    });

    expect(result.current.isRenamed('conversation-1')).toBe(true);
    expect(result.current.isRenamed('conversation-2')).toBe(false);
  });

  it('replaces only the targeted conversation with the auto-generated title', async () => {
    const updated = { ...conversations[1], title: 'AI生成タイトル' };
    vi.mocked(api.autoGenerateTitle).mockResolvedValue(updated);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    await act(async () => {
      await result.current.autoTitle('conversation-2', 'メッセージ');
    });

    expect(api.autoGenerateTitle).toHaveBeenCalledWith('conversation-2', 'メッセージ');
    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual([
      'conversation-1',
      'conversation-2',
    ]);
    expect(result.current.conversations[1]).toBe(updated);
  });

  it('swallows auto title failures without changing the conversation state', async () => {
    vi.mocked(api.autoGenerateTitle).mockRejectedValue(new Error('generation failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    const before = result.current.conversations;

    await act(async () => {
      await result.current.autoTitle('conversation-1', 'メッセージ');
    });

    expect(warn).toHaveBeenCalled();
    expect(result.current.conversations).toBe(before);
    warn.mockRestore();
  });
});

describe('useConversations agent mode toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchConversations).mockResolvedValue(conversations);
  });

  it('optimistically updates agentMode and replaces with the server response', async () => {
    const updated = { ...conversations[1], agentMode: true };
    vi.mocked(api.updateConversationAgentMode).mockResolvedValue(updated);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    const before = result.current.conversations;

    let updatePromise!: Promise<void>;
    act(() => {
      updatePromise = result.current.updateAgentMode('conversation-2', true);
    });
    // 楽観更新: API 応答前に対象会話の agentMode が反映される
    expect(result.current.conversations[1].agentMode).toBe(true);

    await act(async () => {
      await updatePromise;
    });

    expect(api.updateConversationAgentMode).toHaveBeenCalledWith('conversation-2', true);
    expect(result.current.conversations.map((c) => c.id)).toEqual([
      'conversation-1',
      'conversation-2',
    ]);
    expect(result.current.conversations[0]).toBe(before[0]);
    expect(result.current.conversations[1]).toBe(updated);
  });

  it('rolls back agentMode and rethrows when the toggle fails', async () => {
    const error = new Error('toggle failed');
    vi.mocked(api.updateConversationAgentMode).mockRejectedValue(error);
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    const before = result.current.conversations[1];

    let updatePromise!: Promise<void>;
    let thrown: unknown;
    act(() => {
      updatePromise = result.current.updateAgentMode('conversation-2', true).catch((caught) => {
        thrown = caught;
      });
    });
    expect(result.current.conversations[1].agentMode).toBe(true);

    await act(async () => {
      await updatePromise;
    });

    expect(thrown).toBe(error);
    // 失敗時は元の会話オブジェクトへ戻る
    expect(result.current.conversations[1]).toBe(before);
    expect(api.updateConversationAgentMode).toHaveBeenCalledWith('conversation-2', true);
  });
});
