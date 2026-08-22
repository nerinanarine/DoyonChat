import { useState, useEffect, useCallback } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useConversations } from './hooks/useConversations';
import { useChat } from './hooks/useChat';
import AppLayout from './components/Layout/AppLayout';
import ChatMessageList from './components/Chat/ChatMessageList';
import ChatInput from './components/Chat/ChatInput';
import LoginPage from './components/Auth/LoginPage';
import { ModelInfo } from './types';
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
    load,
    updateTitle,
  } = useConversations(dataEnabled);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);

  const {
    messages,
    streamingText,
    streamingReasoning,
    isStreaming,
    loadMessages,
    sendMessage,
    stop,
  } = useChat(activeConversationId);

  // Load models once authenticated
  useEffect(() => {
    if (!dataEnabled) return;
    api.fetchModels().then(setModels).catch(console.error);
  }, [dataEnabled]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  const handleNewChat = useCallback(async () => {
    const defaultModel = models[0]?.id;
    const conv = await create('New Chat', defaultModel);
    setActiveConversationId(conv.id);
  }, [create, models]);

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
      await api.updateConversationModel(activeConversationId, modelId);
      await load();
    },
    [activeConversationId, load],
  );

  const handleSend = useCallback(
    async (text: string, imageBase64?: string) => {
      if (!activeConversationId) {
        // Create new conversation if none selected
        const defaultModel = models[0]?.id;
        const conv = await create(text.slice(0, 30), defaultModel);
        setActiveConversationId(conv.id);
        // Wait a tick for state to update, then send
        setTimeout(() => {
          sendMessage(text, imageBase64);
        }, 50);
        return;
      }
      sendMessage(text, imageBase64);
    },
    [activeConversationId, create, models, sendMessage],
  );

  if (authEnabled && !isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppLayout
      conversations={conversations}
      activeConversationId={activeConversationId}
      models={models}
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
        disabled={convLoading}
      />
    </AppLayout>
  );
}

export default App;
