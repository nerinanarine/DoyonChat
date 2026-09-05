import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Menu, X, ChevronDown, Bot } from 'lucide-react';
import {
  AgentApprovalLevel,
  Conversation,
  ModelInfo,
  UserSettings,
  ModelsStatus,
  SettingsStatus,
} from '../../types';
import ConversationList from '../Sidebar/ConversationList';
import SettingsMenu from '../Settings/SettingsMenu';

interface AppLayoutProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  models: ModelInfo[];
  modelsStatus: ModelsStatus;
  settings: UserSettings;
  settingsStatus: SettingsStatus;
  settingsError: string | null;
  onChangeDefaultModel: (modelId: string | null) => Promise<void>;
  onChangeDisplayName: (name: string | null) => Promise<void>;
  onChangeAgentApprovalLevel?: (level: AgentApprovalLevel | null) => Promise<void>;
  onChangeAgentModel?: (modelId: string | null) => Promise<void>;
  onChangeAgentSubagentModel?: (modelId: string | null) => Promise<void>;
  /** アクティブな会話のエージェントモード状態（会話未選択時は undefined）。 */
  agentMode?: boolean;
  agentModeBusy?: boolean;
  agentModeError?: string | null;
  onToggleAgentMode?: (enabled: boolean) => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => Promise<void>;
  onNewChat: () => void;
  onChangeModel: (modelId: string) => void;
  draftModel?: string;
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  conversations,
  activeConversationId,
  models,
  modelsStatus,
  settings,
  settingsStatus,
  settingsError,
  onChangeDefaultModel,
  onChangeDisplayName,
  onChangeAgentApprovalLevel,
  onChangeAgentModel,
  onChangeAgentSubagentModel,
  agentMode,
  agentModeBusy,
  agentModeError,
  onToggleAgentMode,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onNewChat,
  onChangeModel,
  draftModel,
  children,
}) => {
  const { instance } = useMsal();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';
  // エージェント機能フラグ：VITE_AGENT_ENABLED=false でトグル・バッジを非表示にする（RG-2 F4）
  const agentEnabled = import.meta.env.VITE_AGENT_ENABLED !== 'false';

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const selectedModelId = activeConversation?.model ?? draftModel;
  const activeModel = activeConversation
    ? models.find((m) => m.id === activeConversation.model)
    : models.find((m) => m.id === draftModel);
  const modelLabel =
    modelsStatus === 'loading'
      ? 'モデルを読み込み中'
      : modelsStatus === 'error'
        ? 'モデル一覧を取得できません'
        : activeModel?.name ||
          (selectedModelId ? `${selectedModelId}（利用不可）` : 'モデル未選択');

  const handleLogout = () => {
    instance.logoutRedirect();
  };

  return (
    <div className="h-screen flex bg-white">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={(id) => {
            onSelectConversation(id);
            setSidebarOpen(false);
          }}
          onDelete={onDeleteConversation}
          onRename={onRenameConversation}
          onNewChat={() => {
            onNewChat();
            setSidebarOpen(false);
          }}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-64">
            <ConversationList
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={(id) => {
                onSelectConversation(id);
                setSidebarOpen(false);
              }}
              onDelete={(id) => {
                onDeleteConversation(id);
                setSidebarOpen(false);
              }}
              onRename={onRenameConversation}
              onNewChat={() => {
                onNewChat();
                setSidebarOpen(false);
              }}
            />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-safe border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-gray-900 truncate">
              {activeConversation?.title || 'DoyonChat'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {agentEnabled && activeConversation && (
              <button
                type="button"
                role="switch"
                aria-checked={agentMode === true}
                disabled={agentModeBusy}
                onClick={() => onToggleAgentMode?.(agentMode !== true)}
                title="エージェントモード切替"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  agentMode
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Bot size={14} className={agentMode ? 'text-blue-600' : 'text-gray-500'} />
                エージェント
              </button>
            )}
            {agentModeError && (
              <span role="alert" className="text-xs text-red-600">
                {agentModeError}
              </span>
            )}
            {authEnabled && (
              <SettingsMenu
                models={models}
                modelsStatus={modelsStatus}
                settings={settings}
                settingsStatus={settingsStatus}
                settingsError={settingsError}
                onChangeDefaultModel={onChangeDefaultModel}
                onChangeDisplayName={onChangeDisplayName}
                onChangeAgentApprovalLevel={onChangeAgentApprovalLevel}
                onChangeAgentModel={onChangeAgentModel}
                onChangeAgentSubagentModel={onChangeAgentSubagentModel}
                onLogout={handleLogout}
              />
            )}
            <div className="relative">
              <button
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                disabled={modelsStatus !== 'loaded'}
                aria-expanded={modelMenuOpen}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm text-gray-700"
              >
                {modelLabel}
                <ChevronDown size={14} />
              </button>
              {modelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setModelMenuOpen(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 max-h-80 overflow-y-auto"
                  >
                    {models.map((model) => (
                      <button
                        key={model.id}
                        role="menuitem"
                        onClick={() => {
                          onChangeModel(model.id);
                          setModelMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                          model.id === selectedModelId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-gray-500 truncate">{model.description}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
