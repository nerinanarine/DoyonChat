import { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation } from '../types';
import * as api from '../services/chatApi';
import { errorMessage } from '../services/errorMessages';

export const NEW_CHAT_TITLE = 'New Chat';

export function useConversations(enabled = true) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renamedIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchConversations();
      setConversations(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [load, enabled]);

  const create = useCallback(async (title?: string, model?: string) => {
    const conv = await api.createConversation(title ?? NEW_CHAT_TITLE, model);
    setConversations((prev) => [conv, ...prev]);
    return conv;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateModel = useCallback(async (id: string, model: string) => {
    const updated = await api.updateConversationModel(id, model);
    setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  /**
   * 会話のエージェントモードを切り替える。楽観更新で即座に反映し、
   * サーバー応答で正規化、失敗時は元の状態へロールバックしてエラーを再 throw する。
   */
  const updateAgentMode = useCallback(
    async (id: string, enabled: boolean) => {
      const previous = conversations.find((c) => c.id === id);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, agentMode: enabled } : c)),
      );
      try {
        const updated = await api.updateConversationAgentMode(id, enabled);
        setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
      } catch (error) {
        // 失敗時は元の会話へ戻す。一覧に無い会話は何もしない。
        if (previous) {
          setConversations((prev) => prev.map((c) => (c.id === id ? previous : c)));
        }
        throw error;
      }
    },
    [conversations],
  );

  const updateTitle = useCallback(async (id: string, title: string) => {
    const updated = await api.updateConversationTitle(id, title);
    renamedIds.current.add(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const autoTitle = useCallback(async (id: string, text: string) => {
    try {
      const updated = await api.autoGenerateTitle(id, text);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch {
      // タイトル生成は装飾目的なので、失敗しても無言でチャットを継続する。
      console.warn('[useConversations] auto title generation failed');
    }
  }, []);

  const isRenamed = useCallback((id: string) => renamedIds.current.has(id), []);

  return {
    conversations,
    loading,
    error,
    load,
    create,
    remove,
    updateModel,
    updateTitle,
    updateAgentMode,
    autoTitle,
    isRenamed,
  };
}