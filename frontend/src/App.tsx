import { useState, useEffect, useCallback } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useConversations, NEW_CHAT_TITLE } from './hooks/useConversations';
import { useChat } from './hooks/useChat';
import { useSettings } from './hooks/useSettings';
import AppLayout from './components/Layout/AppLayout';
import ChatMessageList from './components/Chat/ChatMessageList';
import ChatInput from './components/Chat/ChatInput';
import LoginPage from './components/Auth/LoginPage';
import { ModelInfo, ModelsStatus } from './types';
import * as api from './services/chatApi';

const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';

function App() {
  const isAuthenticated = useIsAuthenticated();
  const dataEnabled = !authEnabled || isAuthenticated;
  const {
    conversations,
    loading: convLoading,
    create,
    remove,
    updateModel,
    updateTitle,
    autoTitle,
    isRenamed,
  } = useConversations(dataEnabled);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsStatus, setModelsStatus] = useState<ModelsStatus>('loading');

  const {
    messages,
    streamingText,
    streamingReasoning,
    isStreaming,
    loadMessages,
    sendMessage,
    stop,
  } = useChat(activeConversationId);

  const { settings, status: settingsStatus, error: settingsError, updateSettings } =
    useSettings(dataEnabled);

  // Load models once authenticated
  useEffect(() => {
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

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  const handleNewChat = useCallback(async () => {
    const conv = settings.defaultModel
      ? await create(NEW_CHAT_TITLE, settings.defaultModel)
      : await create(NEW_CHAT_TITLE);
    setActiveConversationId(conv.id);
  }, [create, settings]);

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

  const handleChangeModel = useCallback(
    async (modelId: string) => {
      if (!activeConversationId) return;
      await updateModel(activeConversationId, modelId);
    },
    [activeConversationId, updateModel],
  );

  const handleSend = useCallback(
    async (text: string, imageBase64?: string) => {
      if (!activeConversationId) {
        // Create new conversation if none selected
        const conv = settings.defaultModel
          ? await create(text.slice(0, 30), settings.defaultModel)
          : await create(text.slice(0, 30));
        setActiveConversationId(conv.id);
        // Wait a tick for state to update, then send
        setTimeout(() => {
          sendMessage(text, imageBase64);
        }, 50);
        if (text.trim()) {
          autoTitle(conv.id, text);
        }
        return;
      }
      sendMessage(text, imageBase64);
      if (
        text.trim() &&
        conversations.find((c) => c.id === activeConversationId)?.title === NEW_CHAT_TITLE &&
        !isRenamed(activeConversationId)
      ) {
        autoTitle(activeConversationId, text);
      }
    },
    [activeConversationId, conversations, create, sendMessage, settings, autoTitle, isRenamed],
  );

  const handleChangeDefaultModel = useCallback(
    async (modelId: string | null) => {
      await updateSettings({ defaultModel: modelId ?? null });
    },
    [updateSettings],
  );

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );
  const modelUnavailable =
    modelsStatus === 'loaded' &&
    activeConversation !== undefined &&
    !models.some((model) => model.id === activeConversation.model);
  const modelDisabledReason =
    modelsStatus === 'loading'
      ? 'モデル一覧を読み込み中です。'
      : modelsStatus === 'error'
        ? 'モデル一覧を取得できませんでした。'
        : modelUnavailable
          ? `保存済みモデル「${activeConversation.model}」は利用不可です。利用可能なモデルを再選択してください。`
          : undefined;

  if (authEnabled && !isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppLayout
      conversations={conversations}
      activeConversationId={activeConversationId}
      models={models}
      modelsStatus={modelsStatus}
      settings={settings}
      settingsStatus={settingsStatus}
      settingsError={settingsError}
      onChangeDefaultModel={handleChangeDefaultModel}
      onSelectConversation={handleSelect}
      onDeleteConversation={handleDelete}
      onRenameConversation={updateTitle}
      onNewChat={handleNewChat}
      onChangeModel={handleChangeModel}
    >
      <ChatMessageList
        messages={messages}
        streamingText={streamingText}
        streamingReasoning={streamingReasoning}
        isStreaming={isStreaming}
      />
      <ChatInput
        onSend={handleSend}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={convLoading || Boolean(modelDisabledReason)}
        disabledReason={modelDisabledReason}
      />
    </AppLayout>
  );
}

export default App;
