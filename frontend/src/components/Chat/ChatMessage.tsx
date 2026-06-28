import React from 'react';
import { Message } from '../../types';
import MarkdownRenderer from '../Markdown/MarkdownRenderer';
import { User, Bot } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 px-4 py-5 ${isUser ? 'bg-white' : 'bg-gray-50'}`}>
      <div className="flex-shrink-0 mt-0.5">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isUser ? 'bg-gray-200' : 'bg-blue-600'}`}>
          {isUser ? <User size={14} className="text-gray-600" /> : <Bot size={14} className="text-white" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold mb-1 text-gray-900">
          {isUser ? 'あなた' : 'AI'}
        </div>
        {message.imageUrl && (
          <img src={message.imageUrl} alt="uploaded" className="max-h-48 rounded-lg mb-2 border border-gray-200" />
        )}
        <div className="text-gray-800 text-[15px] leading-relaxed">
          <MarkdownRenderer content={message.content} />
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
