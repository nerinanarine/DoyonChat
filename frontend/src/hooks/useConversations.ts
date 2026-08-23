import { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation } from '../types';
import * as api from '../services/chatApi';

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
      setError((err as Error).message);
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

  const updateTitle = useCallback(async (id: string, title: string) => {
    const updated = await api.updateConversationTitle(id, title);
    renamedIds.current.add(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const autoTitle = useCallback(async (id: string, text: string) => {
    try {
      const updated = await api.autoGenerateTitle(id, text);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      // タイトル生成は装飾目的なので、失敗しても無言でチャットを継続する。
      console.warn('[useConversations] auto title generation failed:', err);
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
    autoTitle,
    isRenamed,
  };
}