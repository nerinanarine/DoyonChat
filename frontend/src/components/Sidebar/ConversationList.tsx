import React, { useRef, useState } from 'react';
import { AgentApprovalLevel, Conversation, UserSettings, SettingsStatus } from '../../types';
import { MessageSquare, MoreHorizontal, Plus, Settings as SettingsIcon } from 'lucide-react';
import { isComposingEnter } from '../../utils/ime';
import SettingsDialog from '../Settings/SettingsDialog';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onNewChat: () => void;
  settings?: UserSettings;
  settingsStatus?: SettingsStatus;
  onChangeDisplayName?: (name: string | null) => Promise<void>;
  onChangeAgentApprovalLevel?: (level: AgentApprovalLevel | null) => Promise<void>;
  onChangeAgentModel?: (modelId: string | null) => Promise<void>;
  onChangeAgentSubagentModel?: (modelId: string | null) => Promise<void>;
  onLogout?: () => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onNewChat,
  settings,
  settingsStatus,
  onChangeDisplayName,
  onChangeAgentApprovalLevel,
  onChangeAgentModel,
  onChangeAgentSubagentModel,
  onLogout,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const savingRef = useRef(false);

  const startEditing = (event: React.MouseEvent, conversation: Conversation) => {
    event.stopPropagation();
    if (savingRef.current) return;
    setEditingId(conversation.id);
    setDraftTitle(conversation.title);
    setRenameError(null);
  };

  const cancelEditing = () => {
    if (savingRef.current) return;
    setEditingId(null);
    setDraftTitle('');
    setRenameError(null);
  };

  const saveTitle = async (conversationId: string) => {
    if (savingRef.current) return;

    const title = draftTitle.trim();
    if (!title) {
      cancelEditing();
      return;
    }
    if (Array.from(title).length > 100) {
      setRenameError('タイトルは100文字以内で入力してください。');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setRenameError(null);
    try {
      await onRename(conversationId, title);
      setEditingId(null);
      setDraftTitle('');
    } catch {
      setRenameError('タイトルを更新できませんでした。もう一度お試しください。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <div className="w-64 bg-gray-900 text-gray-100 flex flex-col h-full flex-shrink-0">
        <div className="p-3 border-b border-gray-800">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            新規チャット
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeId === conv.id ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50 text-gray-300'
              }`}
              onClick={() => {
                setMenuOpenId(null);
                onSelect(conv.id);
              }}
            >
              <MessageSquare size={14} className="flex-shrink-0" />
              {editingId === conv.id ? (
                <div className="flex-1 min-w-0">
                  <input
                    autoFocus
                    aria-label="会話タイトルを編集"
                    aria-invalid={renameError ? true : undefined}
                    value={draftTitle}
                    readOnly={saving}
                    aria-busy={saving}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      setDraftTitle(event.target.value);
                      setRenameError(null);
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') {
                        if (isComposingEnter(event)) return;
                        event.preventDefault();
                        void saveTitle(conv.id);
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelEditing();
                      }
                    }}
                    className="w-full rounded bg-gray-800 border border-gray-600 px-1.5 py-0.5 text-sm text-white outline-none focus:border-blue-500 read-only:opacity-60"
                  />
                  {renameError && (
                    <div role="alert" className="mt-1 text-xs text-red-400">
                      {renameError}
                    </div>
                  )}
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void saveTitle(conv.id);
                      }}
                      disabled={saving}
                      className="px-2 py-1 min-h-[44px] rounded bg-blue-600 text-xs text-white hover:bg-blue-500 disabled:opacity-60"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        cancelEditing();
                      }}
                      disabled={saving}
                      className="px-2 py-1 min-h-[44px] rounded text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-60"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <span className="flex-1 min-w-0 truncate text-sm">{conv.title}</span>
              )}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  aria-label="会話メニュー"
                  aria-haspopup="menu"
                  aria-expanded={menuOpenId === conv.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                  }}
                  className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuOpenId === conv.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuOpenId(null);
                      }}
                    />
                    <div
                      role="menu"
                      aria-label="会話メニュー"
                      className="absolute right-0 top-full mt-1 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20 py-1"
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setMenuOpenId(null);
                        }
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOpenId(null);
                          startEditing(event, conv);
                        }}
                        className="w-full px-3 py-2 min-h-[44px] text-left text-sm text-gray-200 hover:bg-gray-700"
                      >
                        名称変更
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOpenId(null);
                          if (confirm('この会話を削除しますか？')) {
                            onDelete(conv.id);
                          }
                        }}
                        className="w-full px-3 py-2 min-h-[44px] text-left text-sm text-red-400 hover:bg-gray-700"
                      >
                        削除
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">会話がありません</div>
          )}
        </div>
        <div className="p-2 border-t border-gray-800 flex items-center justify-between gap-2">
          <span className="px-1 text-xs text-gray-500">DoyonChat</span>
          {settings && settingsStatus && onChangeDisplayName && onLogout && (
            <button
              type="button"
              aria-label="設定"
              onClick={() => setSettingsOpen(true)}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200"
            >
              <SettingsIcon size={18} />
            </button>
          )}
        </div>
      </div>
      {settings && settingsStatus && onChangeDisplayName && onLogout && (
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          settingsStatus={settingsStatus}
          onChangeDisplayName={onChangeDisplayName}
          onChangeAgentApprovalLevel={onChangeAgentApprovalLevel}
          onChangeAgentModel={onChangeAgentModel}
          onChangeAgentSubagentModel={onChangeAgentSubagentModel}
          onLogout={onLogout}
        />
      )}
    </>
  );
};

export default ConversationList;
