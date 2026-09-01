import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../src/hooks/useSettings';
import * as api from '../../src/services/chatApi';

vi.mock('../../src/services/chatApi', () => ({
  fetchUserSettings: vi.fn(),
  updateUserSettings: vi.fn(),
}));

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchUserSettings).mockResolvedValue({
      userId: 'alice',
      settings: { defaultModel: 'kimi-k2.6' },
    });
  });

  it('loads settings once when enabled', async () => {
    const { result } = renderHook(() => useSettings(true));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(api.fetchUserSettings).toHaveBeenCalledTimes(1);
    expect(result.current.settings).toEqual({ defaultModel: 'kimi-k2.6' });
  });

  it('does not fetch when disabled', () => {
    renderHook(() => useSettings(false));

    expect(api.fetchUserSettings).not.toHaveBeenCalled();
  });

  it('marks a fetch failure as error without loading state', async () => {
    vi.mocked(api.fetchUserSettings).mockRejectedValue(new Error('fetch failed'));
    const { result } = renderHook(() => useSettings(true));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      '通信に失敗しました。接続を確認して再試行してください。',
    );
    expect(result.current.settings).toEqual({});
  });

  it('applies an optimistic update and keeps the server value on success', async () => {
    vi.mocked(api.updateUserSettings).mockResolvedValue({
      userId: 'alice',
      settings: { defaultModel: 'glm-5.1' },
    });
    const { result } = renderHook(() => useSettings(true));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.updateSettings({ defaultModel: 'glm-5.1' });
    });

    expect(api.updateUserSettings).toHaveBeenCalledWith({ defaultModel: 'glm-5.1' });
    expect(result.current.settings).toEqual({ defaultModel: 'glm-5.1' });
  });

  it('rolls back to the previous settings when the update fails', async () => {
    vi.mocked(api.updateUserSettings).mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => useSettings(true));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.updateSettings({ defaultModel: 'glm-5.1' });
      } catch (caught) {
        thrown = caught;
      }
    });

    expect(thrown).toEqual(new Error('save failed'));
    expect(result.current.settings).toEqual({ defaultModel: 'kimi-k2.6' });
    expect(result.current.error).toBe(
      '通信に失敗しました。接続を確認して再試行してください。',
    );
  });

  it('clears defaultModel optimistically when patched with null', async () => {
    vi.mocked(api.updateUserSettings).mockResolvedValue({
      userId: 'alice',
      settings: {},
    });
    const { result } = renderHook(() => useSettings(true));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.updateSettings({ defaultModel: null });
    });

    expect(api.updateUserSettings).toHaveBeenCalledWith({ defaultModel: null });
    expect(result.current.settings).toEqual({});
  });

  it('saves displayName optimistically and trims whitespace', async () => {
    vi.mocked(api.updateUserSettings).mockResolvedValue({
      userId: 'alice',
      settings: { defaultModel: 'kimi-k2.6', displayName: 'Bob' },
    });
    const { result } = renderHook(() => useSettings(true));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    await act(async () => {
      await result.current.updateSettings({ displayName: '  Bob  ' });
    });

    expect(api.updateUserSettings).toHaveBeenCalledWith({ displayName: '  Bob  ' });
    expect(result.current.settings).toEqual({ defaultModel: 'kimi-k2.6', displayName: 'Bob' });
  });

  it('clears displayName optimistically when patched with null or empty', async () => {
    vi.mocked(api.fetchUserSettings).mockResolvedValue({
      userId: 'alice',
      settings: { displayName: 'Alice' },
    });
    vi.mocked(api.updateUserSettings).mockResolvedValue({
      userId: 'alice',
      settings: {},
    });
    const { result } = renderHook(() => useSettings(true));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.settings).toEqual({ displayName: 'Alice' });

    await act(async () => {
      await result.current.updateSettings({ displayName: null });
    });
    expect(result.current.settings).toEqual({});
  });
});