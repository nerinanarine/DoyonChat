import React, { useState, useRef, useCallback } from 'react';
import { Send, Square, ImagePlus, X } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string, imageBase64?: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSend, onStop, isStreaming, disabled }) => {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    if ((!text.trim() && !image) || disabled) return;
    onSend(text.trim(), image || undefined);
    setText('');
    setImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, image, onSend, disabled]);

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('画像サイズは5MB以下にしてください');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {image && (
        <div className="relative inline-block mb-2">
          <img src={image} alt="preview" className="h-16 rounded-lg border border-gray-200" />
          <button
            onClick={() => setImage(null)}
            className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-0.5"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="画像をアップロード"
          type="button"
        >
          <ImagePlus size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
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
            disabled={(!text.trim() && !image) || disabled}
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
