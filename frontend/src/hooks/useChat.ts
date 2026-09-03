import { useState, useCallback, useRef } from 'react';
import { Message } from '../types';
import * as api from '../services/chatApi';
import { errorMessage } from '../services/errorMessages';

const INTERRUPTED_CONTENT = '(生成が中断されました)';

interface SendAttempt {
  conversationId: string;
  text: string;
  imageBase64?: string;
  userMessageId: string;
}

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingActiveRef = useRef(false);
  const stopReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const accumulatedRef = useRef<{ text: string; reasoning: string }>({ text: '', reasoning: '' });
  const lastAttemptRef = useRef<SendAttempt | null>(null);
  const loadIdRef = useRef<string | null>(null);

  const loadMessages = useCallback(async (id: string) => {
    setMessagesLoading(true);
    setLoadError(null);
    loadIdRef.current = id;
    setMessages([]);
    try {
      const data = await api.fetchConversationWithMessages(id);
      if (loadIdRef.current === id) setMessages(data.messages);
    } catch (err) {
      if (loadIdRef.current === id) setLoadError(errorMessage(err));
    } finally {
      if (loadIdRef.current === id) setMessagesLoading(false);
    }
  }, []);

  const startStreaming = useCallback(
    async (attempt: SendAttempt, appendUserMessage: boolean) => {
      const { conversationId: cid, text, imageBase64, userMessageId } = attempt;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (stopReloadTimerRef.current) {
        clearTimeout(stopReloadTimerRef.current);
        stopReloadTimerRef.current = null;
      }
      setError(null);
      setLoadError(null);
      setIsStreaming(true);
      streamingActiveRef.current = true;
      setStreamingText('');
      setStreamingReasoning('');
      accumulatedRef.current = { text: '', reasoning: '' };

      if (appendUserMessage) {
        const userMsg: Message = {
          id: userMessageId,
          conversationId: cid,
          role: 'user',
          content: text,
          imageUrl: imageBase64,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      abortRef.current = api.streamChat(
        cid,
        text,
        imageBase64,
        (chunk) => {
          accumulatedRef.current.text += chunk.content || '';
          accumulatedRef.current.reasoning += chunk.reasoning || '';
          setStreamingText(accumulatedRef.current.text);
          setStreamingReasoning(accumulatedRef.current.reasoning);
        },
        () => {
          streamingActiveRef.current = false;
          setIsStreaming(false);
          setStreamingText('');
          setStreamingReasoning('');
          loadMessages(cid);
        },
        (err) => {
          // ユーザー停止による AbortError はここに来ない（P1-003 の stop() が処理する）。
          streamingActiveRef.current = false;
          setIsStreaming(false);
          setStreamingText('');
          setStreamingReasoning('');
          setError(errorMessage(err));
        },
        { userMessageId },
      );
    },
    [loadMessages],
  );

  const sendMessage = useCallback(
    async (text: string, imageBase64?: string, targetConversationId?: string) => {
      const cid = targetConversationId ?? conversationIdRef.current;
      if (!cid) return;
      const attempt: SendAttempt = {
        conversationId: cid,
        text,
        imageBase64,
        userMessageId: crypto.randomUUID(),
      };
      lastAttemptRef.current = attempt;
      await startStreaming(attempt, true);
    },
    [startStreaming],
  );

  const retrySend = useCallback(() => {
    const attempt = lastAttemptRef.current;
    if (!attempt || !conversationId || attempt.conversationId !== conversationId) return;
    // ユーザーメッセージは既に表示・保存済みのため追加しない（サーバー側も userMessageId で冪等化）
    void startStreaming(attempt, false);
  }, [conversationId, startStreaming]);

  const stop = useCallback(() => {
    const wasStreaming = streamingActiveRef.current;
    const stoppedConversationId = conversationId;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (wasStreaming) {
      streamingActiveRef.current = false;
      const partial = accumulatedRef.current;
      const content = partial.text.trim() ? partial.text : INTERRUPTED_CONTENT;
      if (conversationId) {
        const assistantMsg: Message = {
          id: `partial-${Date.now()}`,
          conversationId,
          role: 'assistant',
          content,
          reasoning: partial.reasoning || undefined,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      // 停止済みのgenerationは再試行対象にしない
      lastAttemptRef.current = null;
    }
    setIsStreaming(false);
    setStreamingText('');
    setStreamingReasoning('');
    setError(null);
    if (wasStreaming && stoppedConversationId) {
      // サーバー側のGeneratorが中間保存を完了した後、正規履歴へ収束させる。
      stopReloadTimerRef.current = setTimeout(() => {
        stopReloadTimerRef.current = null;
        if (conversationIdRef.current === stoppedConversationId) {
          void loadMessages(stoppedConversationId);
        }
      }, 500);
    }
  }, [conversationId, loadMessages]);

  const dismissError = useCallback(() => setError(null), []);

  /**
   * 新規チャット（ドラフト）選択時に旧会話の表示状態を破棄する。
   * 進行中の上流ストリームは abort して、旧画面への onDone 再読込・500ms 収束を防ぐ
   * （サーバー側は既存の中断保存フローで部分保存される）。
   */
  const clearChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (stopReloadTimerRef.current) {
      clearTimeout(stopReloadTimerRef.current);
      stopReloadTimerRef.current = null;
    }
    loadIdRef.current = null;
    streamingActiveRef.current = false;
    accumulatedRef.current = { text: '', reasoning: '' };
    setMessages([]);
    setStreamingText('');
    setStreamingReasoning('');
    setIsStreaming(false);
    setError(null);
    setLoadError(null);
    setMessagesLoading(false);
  }, []);

  return {
    messages,
    streamingText,
    streamingReasoning,
    isStreaming,
    error,
    messagesLoading,
    loadError,
    loadMessages,
    sendMessage,
    retrySend,
    stop,
    dismissError,
    clearChat,
  };
}
