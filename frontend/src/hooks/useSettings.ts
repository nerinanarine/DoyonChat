import { useState, useEffect, useCallback } from 'react';
import { UserSettings } from '../types';
import * as api from '../services/chatApi';

export type SettingsStatus = 'loading' | 'error' | 'loaded';

export function useSettings(enabled = true) {
  const [settings, setSettings] = useState<UserSettings>({});
  const [status, setStatus] = useState<SettingsStatus>(enabled ? 'loading' : 'loaded');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const response = await api.fetchUserSettings();
      setSettings(response.settings);
      setStatus('loaded');
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  const updateSettings = useCallback(
    async (partial: { defaultModel?: string | null }) => {
      const previous = settings;
      if (Object.prototype.hasOwnProperty.call(partial, 'defaultModel')) {
        // Optimistic update; rollback on failure.
        const next = { ...settings };
        if (partial.defaultModel === null || partial.defaultModel === undefined) {
          delete next.defaultModel;
        } else if (typeof partial.defaultModel === 'string') {
          next.defaultModel = partial.defaultModel;
        }
        setSettings(next);
      }
      try {
        const response = await api.updateUserSettings(partial);
        setSettings(response.settings);
        setStatus('loaded');
        setError(null);
        return response;
      } catch (err) {
        setSettings(previous);
        setError((err as Error).message);
        throw err;
      }
    },
    [settings],
  );

  return { settings, status, error, updateSettings, reload: load };
}