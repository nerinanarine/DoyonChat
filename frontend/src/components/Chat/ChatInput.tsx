import React, { useState, useRef, useCallback } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  isStreaming,
  disabled,
  disabledReason,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, onSend, disabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-safe">
      {disabledReason && (
        <p role="status" className="mb-2 text-sm text-amber-700">
          {disabledReason}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力..."
          rows={1}
          disabled={disabled || isStreaming}
          className="flex-1 resize-none max-h-[200px] px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-[15px] disabled:bg-gray-50"
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="p-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            title="停止"
            type="button"
          >
            <Square size={18} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="送信"
            type="button"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
