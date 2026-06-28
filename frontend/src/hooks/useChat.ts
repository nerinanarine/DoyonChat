import { useState, useCallback, useRef } from 'react';
import { Message } from '../types';
import * as api from '../services/chatApi';

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async (id: string) => {
    setError(null);
    try {
      const data = await api.fetchConversationWithMessages(id);
      setMessages(data.messages);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, imageBase64?: string) => {
      if (!conversationId) return;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      setError(null);
      setIsStreaming(true);
      setStreamingText('');

      // Optimistically add user message
      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId,
        role: 'user',
        content: text,
        imageUrl: imageBase64,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      let assistantText = '';
      abortRef.current = api.streamChat(
        conversationId,
        text,
        imageBase64,
        (chunk) => {
          assistantText += chunk;
          setStreamingText(assistantText);
        },
        () => {
          setIsStreaming(false);
          setStreamingText('');
          // Refresh messages from server
          loadMessages(conversationId);
        },
        (err) => {
          setIsStreaming(false);
          setStreamingText('');
          setError(err.message);
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              conversationId,
              role: 'assistant',
              content: `エラー: ${err.message}`,
              createdAt: new Date().toISOString(),
            },
          ]);
        },
      );
    },
    [conversationId, loadMessages],
  );

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    setStreamingText('');
  }, []);

  return { messages, streamingText, isStreaming, error, loadMessages, sendMessage, stop };
}
