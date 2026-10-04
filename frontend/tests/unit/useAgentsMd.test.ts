import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentsMd } from '../../src/hooks/useAgentsMd';
import * as api from '../../src/services/chatApi';

vi.mock('../../src/services/chatApi', () => ({
  fetchAgentsMd: vi.fn(),
  updateAgentsMd: vi.fn(),
}));

describe('useAgentsMd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchAgentsMd).mockResolvedValue({ userId: 'alice', content: '# 現在の指示' });
  });

  it('loads the current content on mount', async () => {
    const { result } = renderHook(() => useAgentsMd());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(api.fetchAgentsMd).toHaveBeenCalledTimes(1);
    expect(result.current.content).toBe('# 現在の指示');
  });

  it('treats an unset document (null) as loaded with no content', async () => {
    vi.mocked(api.fetchAgentsMd).mockResolvedValue(null);
    const { result } = renderHook(() => useAgentsMd());

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.content).toBeNull();
  });

  it('marks a load failure as error with a safe message', async () => {
    vi.mocked(api.fetchAgentsMd).mockRejectedValue(new Error('fetch failed'));
    const { result } = renderHook(() => useAgentsMd());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('通信に失敗しました。接続を確認して再試行してください。');
  });

  it('stores the saved content on success', async () => {
    vi.mocked(api.updateAgentsMd).mockResolvedValue({ userId: 'alice', content: '# 保存済み' });
    const { result } = renderHook(() => useAgentsMd());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.save('# 保存済み');
    });

    expect(api.updateAgentsMd).toHaveBeenCalledWith('# 保存済み');
    expect(result.current.content).toBe('# 保存済み');
  });

  it('clears the content when saved empty', async () => {
    vi.mocked(api.updateAgentsMd).mockResolvedValue({ userId: 'alice', content: '' });
    const { result } = renderHook(() => useAgentsMd());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.save('');
    });

    expect(api.updateAgentsMd).toHaveBeenCalledWith('');
    expect(result.current.content).toBe('');
  });

  it('surfaces a save failure and keeps the previous content', async () => {
    vi.mocked(api.updateAgentsMd).mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => useAgentsMd());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await expect(result.current.save('# 新')).rejects.toThrow('save failed');
    });

    expect(result.current.error).toBe('通信に失敗しました。接続を確認して再試行してください。');
    expect(result.current.content).toBe('# 現在の指示');
  });
});
