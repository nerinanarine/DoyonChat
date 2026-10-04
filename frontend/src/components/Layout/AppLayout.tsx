import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Menu, X } from 'lucide-react';
import {
  AgentApprovalLevel,
  Conversation,
  UserSettings,
  SettingsStatus,
} from '../../types';
import ConversationList from '../Sidebar/ConversationList';
import SettingsMenu from '../Settings/SettingsMenu';

interface AppLayoutProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  settings: UserSettings;
  settingsStatus: SettingsStatus;
  onChangeDisplayName: (name: string | null) => Promise<void>;
  onChangeAgentApprovalLevel?: (level: AgentApprovalLevel | null) => Promise<void>;
  onChangeAgentModel?: (modelId: string | null) => Promise<void>;
  onChangeAgentSubagentModel?: (modelId: string | null) => Promise<void>;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => Promise<void>;
  onNewChat: () => void;
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  conversations,
  activeConversationId,
  settings,
  settingsStatus,
  onChangeDisplayName,
  onChangeAgentApprovalLevel,
  onChangeAgentModel,
  onChangeAgentSubagentModel,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onNewChat,
  children,
}) => {
  const { instance } = useMsal();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

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
            {authEnabled && (
              <SettingsMenu
                settings={settings}
                settingsStatus={settingsStatus}
                onChangeDisplayName={onChangeDisplayName}
                onChangeAgentApprovalLevel={onChangeAgentApprovalLevel}
                onChangeAgentModel={onChangeAgentModel}
                onChangeAgentSubagentModel={onChangeAgentSubagentModel}
                onLogout={handleLogout}
              />
            )}
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
