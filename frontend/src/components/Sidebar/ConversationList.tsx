import React, { useRef, useState } from 'react';
import { Conversation } from '../../types';
import { MessageSquare, Trash2, Plus } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onNewChat: () => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onNewChat,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
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
            onClick={() => onSelect(conv.id)}
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
                  onBlur={cancelEditing}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      if (event.nativeEvent.isComposing) return;
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
              </div>
            ) : (
              <button
                type="button"
                onClick={(event) => startEditing(event, conv)}
                className="flex-1 min-w-0 truncate text-left text-sm"
                title="タイトルを編集"
              >
                {conv.title}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('この会話を削除しますか？')) {
                  onDelete(conv.id);
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-opacity"
              title="削除"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">会話がありません</div>
        )}
      </div>
      <div className="p-3 border-t border-gray-800 text-xs text-gray-500 text-center">
        OpenCode Chat
      </div>
    </div>
  );
};

export default ConversationList;
