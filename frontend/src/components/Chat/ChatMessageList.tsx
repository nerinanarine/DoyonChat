import React, { useEffect, useRef } from 'react';
import { Message } from '../../types';
import ChatMessage from './ChatMessage';
import MarkdownRenderer from '../Markdown/MarkdownRenderer';
import { Bot } from 'lucide-react';

interface ChatMessageListProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, streamingText, isStreaming }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Bot size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">新しい会話を始めましょう</p>
          <p className="text-sm mt-1">メッセージを入力してAIとチャットできます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {isStreaming && (
        <div className="flex gap-3 px-4 py-5 bg-gray-50">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold mb-1 text-gray-900">AI</div>
            <div className="text-gray-800 text-[15px] leading-relaxed">
              <MarkdownRenderer content={streamingText} />
              <span className="inline-block w-2 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};

export default ChatMessageList;
