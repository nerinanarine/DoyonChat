import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversations } from '../../src/hooks/useConversations';
import * as api from '../../src/services/chatApi';
import { Conversation } from '../../src/types';

vi.mock('../../src/services/chatApi', () => ({
  fetchConversations: vi.fn(),
  updateConversationTitle: vi.fn(),
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
  });
});
