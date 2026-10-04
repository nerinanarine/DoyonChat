import { useCallback, useEffect, useState } from 'react';
import { UserAgentsMdResponse } from '../types';
import * as api from '../services/chatApi';
import { errorMessage } from '../services/errorMessages';

export type AgentsMdStatus = 'loading' | 'error' | 'loaded';

/**
 * 自分の AGENTS.md を読み書きするフック（P2-020 US1）。
 * 未設定（GET 404）は content=null として扱い、UI側で既定文を表示する。'' の保存はクリア。
 */
export function useAgentsMd() {
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentsMdStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const response = await api.fetchAgentsMd();
      setContent(response ? response.content : null);
      setStatus('loaded');
    } catch (err) {
      setStatus('error');
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (value: string): Promise<UserAgentsMdResponse> => {
    setSaving(true);
    setError(null);
    try {
      const response = await api.updateAgentsMd(value);
      setContent(response.content);
      setStatus('loaded');
      return response;
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { content, status, error, saving, save, reload: load };
}
