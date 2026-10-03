import { useState, useCallback, useRef } from 'react';
import { AgentApprovalRequest, AgentStreamEvent, Message } from '../types';
import * as api from '../services/chatApi';
import { ApiError } from '../services/api';
import { errorMessage, isColdStartError } from '../services/errorMessages';

const INTERRUPTED_CONTENT = '(生成が中断されました)';

// P2-018: gateway コールドスタート検出の暫定値（Phase 0 実測スキップのため机上値）。
// dev 検証でコールドスタート時間を実測し補正する。
const AGENT_STARTUP_POLL_INTERVAL_MS = 5_000;
const AGENT_STARTUP_TIMEOUT_MS = 300_000;
const AGENT_STARTUP_TIMEOUT_MESSAGE =
  'エージェントサービスの起動に時間がかかっています。再試行してください。';
const AGENT_STARTUP_ERROR_MESSAGE =
  'エージェントサービスを起動できませんでした。再試行してください。';

/**
 * コールドスタートのポーリングを継続すべきエラーか。5xx・タイムアウト・ネットワークは
 * 「起動中」として継続し、4xx と設定不備の 503（'Agent service unavailable' 以外）は
 * 明示的な設定エラーとして即時エラーUIへ遷移する（FR-004）。
 */
function isTransientStartupError(error: unknown): boolean {
  if (error instanceof ApiError) {
    // 503 は gateway 未起動（'Agent service unavailable'）のみ起動中として継続する。
    if (error.status === 503) return isColdStartError(error);
    return error.status >= 500;
  }
  return true;
}

interface SendAttempt {
  conversationId: string;
  text: string;
  userMessageId: string;
}

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentStreamEvent[]>([]);
  const [approvalRequest, setApprovalRequest] = useState<AgentApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // P2-018: gateway 起動中（コールドスタート）のローディング表示。
  const [agentStarting, setAgentStarting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingActiveRef = useRef(false);
  const stopReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const accumulatedRef = useRef<{ text: string; reasoning: string }>({ text: '', reasoning: '' });
  const approvalRequestRef = useRef<AgentApprovalRequest | null>(null);
  approvalRequestRef.current = approvalRequest;
  const lastAttemptRef = useRef<SendAttempt | null>(null);
  const loadIdRef = useRef<string | null>(null);
  // 起動ポーリングのキャンセル、成功時に実行する再試行、自己参照用の関数保持。
  const startupRef = useRef<{ cancel: () => void } | null>(null);
  const lastRetryRef = useRef<(() => void) | null>(null);
  const startStreamingRef = useRef<
    (attempt: SendAttempt, appendUserMessage: boolean) => Promise<void>
  >(async () => {});
  const submitApprovalRef = useRef<
    (approved: boolean, request: AgentApprovalRequest) => Promise<void>
  >(async () => {});

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

  /**
   * gateway コールドスタート時の起動中表示＋ポーリングを開始する（P2-018）。
   * 5秒間隔で `/agent/models` 中継を叩き、成功したら再試行アクションを実行する。
   * 明示的な設定エラー、または合計タイムアウト超過でのみエラーUIへ遷移する。
   */
  const beginAgentStartup = useCallback((retryAction: () => void) => {
    startupRef.current?.cancel();
    setAgentStarting(true);
    setError(null);
    lastRetryRef.current = retryAction;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };
    startupRef.current = { cancel };
    const finish = (message: string | null) => {
      if (cancelled) return;
      cancel();
      setAgentStarting(false);
      if (message === null) {
        lastRetryRef.current = null;
        retryAction();
      } else {
        setError(message);
      }
    };
    const poll = async () => {
      if (cancelled) return;
      try {
        await api.fetchAgentModels();
        finish(null);
      } catch (err) {
        if (cancelled) return;
        if (isTransientStartupError(err)) {
          pollTimer = setTimeout(poll, AGENT_STARTUP_POLL_INTERVAL_MS);
        } else {
          finish(AGENT_STARTUP_ERROR_MESSAGE);
        }
      }
    };
    hardTimer = setTimeout(() => finish(AGENT_STARTUP_TIMEOUT_MESSAGE), AGENT_STARTUP_TIMEOUT_MS);
    pollTimer = setTimeout(poll, AGENT_STARTUP_POLL_INTERVAL_MS);
  }, []);

  const startStreaming = useCallback(
    async (attempt: SendAttempt, appendUserMessage: boolean) => {
      const { conversationId: cid, text, userMessageId } = attempt;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (stopReloadTimerRef.current) {
        clearTimeout(stopReloadTimerRef.current);
        stopReloadTimerRef.current = null;
      }
      if (startupRef.current) {
        startupRef.current.cancel();
        startupRef.current = null;
        setAgentStarting(false);
      }
      // 新しい送信は以前のコールドスタート再試行を無効化する
      lastRetryRef.current = null;
      setError(null);
      setLoadError(null);
      setIsStreaming(true);
      streamingActiveRef.current = true;
      setStreamingText('');
      setStreamingReasoning('');
      setAgentProgress([]);
      setApprovalRequest(null);
      setApprovalBusy(false);
      accumulatedRef.current = { text: '', reasoning: '' };

      if (appendUserMessage) {
        const userMsg: Message = {
          id: userMessageId,
          conversationId: cid,
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      abortRef.current = api.streamChat(
        cid,
        text,
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
          setApprovalRequest(null);
          setApprovalBusy(false);
          loadMessages(cid);
        },
        (err) => {
          // ユーザー停止による AbortError はここに来ない（P1-003 の stop() が処理する）。
          streamingActiveRef.current = false;
          setIsStreaming(false);
          setStreamingText('');
          setStreamingReasoning('');
          setApprovalRequest(null);
          setApprovalBusy(false);
          if (isColdStartError(err)) {
            // P2-018 FR-003: コールドスタート。起動中表示＋ポーリング→成功時に自動再送する。
            beginAgentStartup(() => {
              if (conversationIdRef.current === attempt.conversationId) {
                void startStreamingRef.current(attempt, false);
              }
            });
            return;
          }
          setError(errorMessage(err));
        },
        {
          userMessageId,
          onAgentEvent: (event) => {
            setAgentProgress((prev) => {
              // 同一 toolCallId の連続 tool_update は最新のみ保持する（P3-014）。
              // researcher 実行中は update が大量発生し、同一文言の行で埋まるため。
              const last = prev[prev.length - 1];
              if (
                event.kind === 'tool_update' &&
                event.toolCallId !== undefined &&
                last !== undefined &&
                last.kind === 'tool_update' &&
                last.toolCallId === event.toolCallId
              ) {
                return [...prev.slice(0, -1), event];
              }
              return [...prev, event];
            });
          },
          onApproval: (request) => {
            if (request.expired) {
              // タイムアウト: 同一承認のダイアログを確実に閉じる
              setApprovalRequest((prev) => (prev && prev.id === request.id ? null : prev));
            } else {
              setApprovalRequest(request);
              setAgentProgress((prev) => [...prev, { kind: 'approval_request' }]);
            }
          },
        },
      );
    },
    [loadMessages, beginAgentStartup],
  );
  startStreamingRef.current = startStreaming;

  const sendMessage = useCallback(
    async (text: string, targetConversationId?: string) => {
      const cid = targetConversationId ?? conversationIdRef.current;
      if (!cid) return;
      const attempt: SendAttempt = {
        conversationId: cid,
        text,
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

  /** コールドスタート後の再試行。保留中アクション（送信/承認）があればそれを、なければ送信を再試行する。 */
  const retry = useCallback(() => {
    const action = lastRetryRef.current;
    lastRetryRef.current = null;
    if (action) action();
    else retrySend();
  }, [retrySend]);

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
      setApprovalRequest(null);
      setApprovalBusy(false);
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
   * 承認リクエスト 1 回分をゲートウェイへ送る。レスポンス後（成否を問わず）ダイアログは既に閉じている。
   * P2-018 FR-006: コールドスタートの 503 は起動中表示＋ポーリング→成功時に自動再送にする。
   */
  const submitApproval = useCallback(
    async (approved: boolean, request: AgentApprovalRequest) => {
      // 新しい承認も以前のコールドスタート再試行を無効化する
      lastRetryRef.current = null;
      try {
        await api.respondAgentApproval({
          approvalId: request.id,
          runId: request.runId,
          approved,
        });
        setApprovalBusy(false);
      } catch (err) {
        setApprovalBusy(false);
        if (isColdStartError(err)) {
          beginAgentStartup(() => {
            void submitApprovalRef.current(approved, request);
          });
          return;
        }
        setError(errorMessage(err));
      }
    },
    [beginAgentStartup],
  );
  submitApprovalRef.current = submitApproval;

  /**
   * 承認ダイアログへの応答。ダイアログは応答後（成否を問わず）確実に閉じる。
   * gateway 側のタイムアウト拒否（expired）と二重に効いても安全なため、
   * 既に応答済み（ダイアログなし）の場合は何もしない。
   */
  const respondApproval = useCallback(
    async (approved: boolean) => {
      const request = approvalRequestRef.current;
      if (!request || request.expired) return;
      setApprovalRequest(null);
      setApprovalBusy(true);
      setAgentProgress((prev) => [...prev, { kind: 'approval_resolved', approved }]);
      await submitApproval(approved, request);
    },
    [submitApproval],
  );

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
    if (startupRef.current) {
      startupRef.current.cancel();
      startupRef.current = null;
    }
    loadIdRef.current = null;
    streamingActiveRef.current = false;
    accumulatedRef.current = { text: '', reasoning: '' };
    setAgentProgress([]);
    setApprovalRequest(null);
    setApprovalBusy(false);
    setMessages([]);
    setStreamingText('');
    setStreamingReasoning('');
    setIsStreaming(false);
    setAgentStarting(false);
    setError(null);
    setLoadError(null);
    setMessagesLoading(false);
  }, []);

  return {
    messages,
    streamingText,
    streamingReasoning,
    agentProgress,
    approvalRequest,
    approvalBusy,
    isStreaming,
    agentStarting,
    error,
    messagesLoading,
    loadError,
    loadMessages,
    sendMessage,
    retrySend,
    retry,
    stop,
    dismissError,
    respondApproval,
    clearChat,
  };
}
