import { useState, useEffect, useCallback } from 'react';
import { Conversation } from '../types';
import * as api from '../services/chatApi';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    load();
  }, [load]);

  const create = useCallback(async (title?: string, model?: string) => {
    const conv = await api.createConversation(title, model);
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

  return { conversations, loading, error, load, create, remove, updateModel };
}
