import { useState, useEffect, useCallback } from 'react';
import { AgentApprovalLevel, UserSettings } from '../types';
import * as api from '../services/chatApi';
import { errorMessage } from '../services/errorMessages';

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
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  const updateSettings = useCallback(
    async (partial: {
      defaultModel?: string | null;
      displayName?: string | null;
      agentApprovalLevel?: AgentApprovalLevel | null;
      agentModel?: string | null;
      agentSubagentModel?: string | null;
    }) => {
      const previous = settings;
      // Optimistic update; rollback on failure.
      const next = { ...settings };
      if (Object.prototype.hasOwnProperty.call(partial, 'defaultModel')) {
        if (partial.defaultModel === null || partial.defaultModel === undefined) {
          delete next.defaultModel;
        } else if (typeof partial.defaultModel === 'string') {
          next.defaultModel = partial.defaultModel;
        }
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'displayName')) {
        if (partial.displayName === null || partial.displayName === '' || partial.displayName === undefined) {
          delete next.displayName;
        } else if (typeof partial.displayName === 'string') {
          next.displayName = partial.displayName.trim();
        }
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'agentApprovalLevel')) {
        if (partial.agentApprovalLevel === null || partial.agentApprovalLevel === undefined) {
          delete next.agentApprovalLevel;
        } else if (
          partial.agentApprovalLevel === 'auto' ||
          partial.agentApprovalLevel === 'dangerous-only' ||
          partial.agentApprovalLevel === 'always'
        ) {
          next.agentApprovalLevel = partial.agentApprovalLevel;
        }
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'agentModel')) {
        if (partial.agentModel === null || partial.agentModel === '' || partial.agentModel === undefined) {
          delete next.agentModel;
        } else if (typeof partial.agentModel === 'string') {
          next.agentModel = partial.agentModel.trim();
        }
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'agentSubagentModel')) {
        if (partial.agentSubagentModel === null || partial.agentSubagentModel === '' || partial.agentSubagentModel === undefined) {
          delete next.agentSubagentModel;
        } else if (typeof partial.agentSubagentModel === 'string') {
          next.agentSubagentModel = partial.agentSubagentModel.trim();
        }
      }
      setSettings(next);
      try {
        const response = await api.updateUserSettings(partial);
        setSettings(response.settings);
        setStatus('loaded');
        setError(null);
        return response;
      } catch (err) {
        setSettings(previous);
        setError(errorMessage(err));
        throw err;
      }
    },
    [settings],
  );

  return { settings, status, error, updateSettings, reload: load };
}