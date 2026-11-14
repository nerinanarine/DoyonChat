import { useState, useEffect, useCallback } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useConversations, NEW_CHAT_TITLE } from './hooks/useConversations';
import { useChat } from './hooks/useChat';
import { useSettings } from './hooks/useSettings';
import AppLayout from './components/Layout/AppLayout';
import ChatMessageList from './components/Chat/ChatMessageList';
import ChatInput from './components/Chat/ChatInput';
import ArtifactDownload from './components/Chat/ArtifactDownload';
import LoginPage from './components/Auth/LoginPage';
import LoadingState from './components/Common/LoadingState';
import ErrorMessage from './components/Common/ErrorMessage';
import { ModelInfo, ModelsStatus, AgentApprovalLevel } from './types';
import * as api from './services/chatApi';
import { ApiError } from './services/api';
import { isColdStartError } from './services/errorMessages';

const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';

const BOOTSTRAP_ERROR_MESSAGE =
  '初期データの読み込みに失敗しました。接続を確認して再試行してください。';

// P2-018: gateway 先行起動のポーリング。useChat のコールドスタート検出と同値。
const AGENT_WARMUP_POLL_INTERVAL_MS = 5_000;
const AGENT_WARMUP_TIMEOUT_MS = 300_000;
// P2-018 FR-004: タイムアウト・設定エラーは P2-003 型のエラーUIへ遷移する。
const AGENT_WARMUP_TIMEOUT_MESSAGE =
  'エージェントサービスの起動に時間がかかっています。再試行してください。';
const AGENT_WARMUP_ERROR_MESSAGE =
  'エージェントサービスを起動できませんでした。再試行してください。';

/**
 * useChat.isTransientStartupError と同じ判別（P2-018 FR-004）。
 * 5xx・タイムアウト・ネットワークは起動中として継続し、4xx と設定不備の 503 は即時エラーにする。
 */
function isTransientWarmupError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 503) return isColdStartError(error);
    return error.status >= 500;
  }
  return true;
}

function App() {
  const isAuthenticated = useIsAuthenticated();
  const dataEnabled = !authEnabled || isAuthenticated;
  const {
    conversations,
    loading: convLoading,
    error: convError,
    load: reloadConversations,
    create,
    remove,
    updateTitle,
    autoTitle,
    isRenamed,
  } = useConversations(dataEnabled);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsStatus, setModelsStatus] = useState<ModelsStatus>('loading');
  const [agentWarming, setAgentWarming] = useState(false);
  const [agentWarmupError, setAgentWarmupError] = useState<string | null>(null);
  const [warmupAttempt, setWarmupAttempt] = useState(0);

  const {
    messages,
    streamingText,
    streamingReasoning,
    agentProgress,
    approvalRequest,
    approvalBusy,
    isStreaming,
    agentStarting,
    error: chatError,
    messagesLoading,
    loadError,
    loadMessages,
    sendMessage,
    retry,
    stop,
    dismissError,
    respondApproval,
    clearChat,
  } = useChat(activeConversationId);

  const { userId, settings, status: settingsStatus, updateSettings, reload: reloadSettings } =
    useSettings(dataEnabled);

  const loadModels = useCallback(() => {
    if (!dataEnabled) return;
    setModelsStatus('loading');
    api
      .fetchModels()
      .then((loadedModels) => {
        setModels(loadedModels);
        setModelsStatus('loaded');
      })
      .catch(() => setModelsStatus('error'));
  }, [dataEnabled]);

  // Load models once authenticated（メッセージのモデル名表示解決に使用。P2-019）
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // P2-018: 認証後マウント時に gateway を先行起動する。503 等の一時失敗は起動中として
  // 5秒間隔で成功までポーリングし、合計 300 秒で打ち切る（useChat.beginAgentStartup と同型）。
  // FR-004: タイムアウト・設定エラーは P2-003 型のエラーUIへ遷移する。
  useEffect(() => {
    if (!dataEnabled) return;
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    setAgentWarming(true);
    setAgentWarmupError(null);

    const stop = () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };

    const fail = (message: string) => {
      stop();
      setAgentWarming(false);
      setAgentWarmupError(message);
    };

    const poll = async () => {
      if (!active) return;
      try {
        await api.fetchAgentModels();
        if (!active) return;
        stop();
        setAgentWarming(false);
      } catch (err) {
        if (!active) return;
        if (isTransientWarmupError(err)) {
          pollTimer = setTimeout(poll, AGENT_WARMUP_POLL_INTERVAL_MS);
        } else {
          fail(AGENT_WARMUP_ERROR_MESSAGE);
        }
      }
    };

    hardTimer = setTimeout(() => {
      if (!active) return;
      fail(AGENT_WARMUP_TIMEOUT_MESSAGE);
    }, AGENT_WARMUP_TIMEOUT_MS);
    void poll();

    return () => {
      stop();
    };
  }, [dataEnabled, warmupAttempt]);

  // Load messages when conversation changes; clear the previous chat when entering a draft
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    } else {
      clearChat();
    }
  }, [activeConversationId, loadMessages, clearChat]);

  const retryBootstrap = useCallback(() => {
    if (modelsStatus === 'error') loadModels();
    if (convError !== null) void reloadConversations();
    if (settingsStatus === 'error') void reloadSettings();
  }, [modelsStatus, convError, settingsStatus, loadModels, reloadConversations, reloadSettings]);

  const retryAgentWarmup = useCallback(() => {
    setWarmupAttempt((attempt) => attempt + 1);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [remove, activeConversationId],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!activeConversationId) {
        // Create new conversation if none selected
        const conv = await create(text.slice(0, 30));
        setActiveConversationId(conv.id);
        // Wait a tick for state to update, then send
        setTimeout(() => {
          sendMessage(text, conv.id);
        }, 50);
        if (text.trim()) {
          autoTitle(conv.id, text);
        }
        return;
      }
      sendMessage(text);
      if (
        text.trim() &&
        conversations.find((c) => c.id === activeConversationId)?.title === NEW_CHAT_TITLE &&
        !isRenamed(activeConversationId)
      ) {
        autoTitle(activeConversationId, text);
      }
    },
    [activeConversationId, conversations, create, sendMessage, autoTitle, isRenamed],
  );

  const handleChangeDisplayName = useCallback(
    async (name: string | null) => {
      await updateSettings({ displayName: name ?? null });
    },
    [updateSettings],
  );

  const handleChangeAgentApprovalLevel = useCallback(
    async (level: AgentApprovalLevel | null) => {
      await updateSettings({ agentApprovalLevel: level ?? null });
    },
    [updateSettings],
  );

  const handleChangeAgentModel = useCallback(
    async (modelId: string | null) => {
      await updateSettings({ agentModel: modelId ?? null });
    },
    [updateSettings],
  );

  const handleChangeAgentSubagentModel = useCallback(
    async (modelId: string | null) => {
      await updateSettings({ agentSubagentModel: modelId ?? null });
    },
    [updateSettings],
  );

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  if (authEnabled && !isAuthenticated) {
    return <LoginPage />;
  }

  // P2-013: 初期データ取得中のローディング表示
  const bootstrapLoading =
    dataEnabled &&
    (modelsStatus === 'loading' || convLoading || settingsStatus === 'loading');
  // P2-003: 初期取得エラーは共通エラー表示＋再試行へ接続する
  const bootstrapError =
    dataEnabled &&
    (modelsStatus === 'error' || settingsStatus === 'error' || convError !== null);

  if (bootstrapLoading) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <LoadingState label="データを読み込み中..." />
      </div>
    );
  }
  if (bootstrapError) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <ErrorMessage message={BOOTSTRAP_ERROR_MESSAGE} onRetry={retryBootstrap} />
      </div>
    );
  }
  // P2-018 FR-004: ウォームアップのタイムアウト・設定エラーは P2-003 型のエラーUIへ遷移する。
  if (agentWarmupError) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <ErrorMessage message={agentWarmupError} onRetry={retryAgentWarmup} />
      </div>
    );
  }

  return (
    <AppLayout
      conversations={conversations}
      activeConversationId={activeConversationId}
      settings={settings}
      settingsStatus={settingsStatus}
      onChangeDisplayName={handleChangeDisplayName}
      onChangeAgentApprovalLevel={handleChangeAgentApprovalLevel}
      onChangeAgentModel={handleChangeAgentModel}
      onChangeAgentSubagentModel={handleChangeAgentSubagentModel}
      onSelectConversation={handleSelect}
      onDeleteConversation={handleDelete}
      onRenameConversation={updateTitle}
      onNewChat={handleNewChat}
    >
      {(agentStarting || agentWarming) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/80">
          <LoadingState label="エージェントサービスを起動しています..." />
        </div>
      )}
      {!agentStarting && chatError && (
        <ErrorMessage
          message={chatError}
          onRetry={retry}
          onDismiss={dismissError}
        />
      )}
      {loadError && activeConversationId && (
        <ErrorMessage
          message={loadError}
          onRetry={() => void loadMessages(activeConversationId)}
        />
      )}
      <ChatMessageList
        messages={messages}
        streamingText={streamingText}
        streamingReasoning={streamingReasoning}
        isStreaming={isStreaming}
        loading={messagesLoading}
        models={models}
        settings={settings}
        currentModel={activeConversation?.model}
        agentProgress={agentProgress}
        approvalRequest={approvalRequest}
        approvalBusy={approvalBusy}
        onRespondApproval={(approved) => void respondApproval(approved)}
      />
      <ChatInput
        onSend={handleSend}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={convLoading || messagesLoading || agentStarting || agentWarming}
      />
      <ArtifactDownload userId={userId} />
    </AppLayout>
  );
}

export default App;
