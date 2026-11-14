import React, { useEffect, useRef, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Menu, X } from 'lucide-react';
import {
  AgentApprovalLevel,
  Conversation,
  UserSettings,
  SettingsStatus,
} from '../../types';
import ConversationList from '../Sidebar/ConversationList';

const SIDEBAR_WIDTH_KEY = 'doyonchat.sidebarWidth';
const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_KEYBOARD_STEP = 16;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

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
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const updateSidebarWidth = (width: number) => {
    const next = clampSidebarWidth(width);
    setSidebarWidth(next);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
    } catch {
      // 保存できない環境（プライベートブラウズ等）では幅の保持だけ諦める
    }
  };

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: event.clientX, width: sidebarWidth };
    setResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    updateSidebarWidth(start.width + event.clientX - start.x);
  };

  const endResize = () => {
    dragStart.current = null;
    setResizing(false);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      updateSidebarWidth(sidebarWidth - SIDEBAR_KEYBOARD_STEP);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      updateSidebarWidth(sidebarWidth + SIDEBAR_KEYBOARD_STEP);
    }
  };

  // P4-001: モバイルサイドバーは Escape キーでも閉じる
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  const handleLogout = () => {
    instance.logoutRedirect();
  };

  return (
    <div className="h-dvh flex bg-white">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <ConversationList
          width={sidebarWidth}
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
          settings={settings}
          settingsStatus={settingsStatus}
          onChangeDisplayName={onChangeDisplayName}
          onChangeAgentApprovalLevel={onChangeAgentApprovalLevel}
          onChangeAgentModel={onChangeAgentModel}
          onChangeAgentSubagentModel={onChangeAgentSubagentModel}
          onLogout={handleLogout}
        />
      </div>

      {/* Sidebar resize handle (desktop only) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="サイドバー幅を調整"
        aria-valuenow={sidebarWidth}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuetext={`${sidebarWidth}px`}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onKeyDown={handleResizeKeyDown}
        className={`hidden md:flex relative w-3 flex-shrink-0 items-center justify-center touch-none select-none cursor-col-resize group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
          resizing ? 'bg-blue-50' : ''
        }`}
      >
        {/* 44px タッチ領域（レイアウト幅は 12px のまま） */}
        <span className="absolute inset-y-0 -left-4 -right-4" aria-hidden="true" />
        <span
          className={`h-full ${resizing ? 'w-0.5 bg-blue-500' : 'w-px bg-gray-200 group-hover:bg-blue-400'}`}
          aria-hidden="true"
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
              settings={settings}
              settingsStatus={settingsStatus}
              onChangeDisplayName={onChangeDisplayName}
              onChangeAgentApprovalLevel={onChangeAgentApprovalLevel}
              onChangeAgentModel={onChangeAgentModel}
              onChangeAgentSubagentModel={onChangeAgentSubagentModel}
              onLogout={handleLogout}
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
              className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-gray-900 truncate">
              {activeConversation?.title || 'DoyonChat'}
            </h1>
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
