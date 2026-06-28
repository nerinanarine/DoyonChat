import React from 'react';
import { Conversation } from '../../types';
import { MessageSquare, Trash2, Plus } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
}) => {
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
            <span className="flex-1 truncate text-sm">{conv.title}</span>
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
