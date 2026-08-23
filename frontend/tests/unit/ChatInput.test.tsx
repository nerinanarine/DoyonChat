import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatInput from '../../src/components/Chat/ChatInput';

describe('ChatInput disabled reason', () => {
  it('shows the reason and blocks text, image, and send controls', () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        onStop={vi.fn()}
        isStreaming={false}
        disabled
        disabledReason="保存済みモデル「retired-model」は利用不可です。利用可能なモデルを再選択してください。"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '保存済みモデル「retired-model」は利用不可です。利用可能なモデルを再選択してください。',
    );
    expect(screen.getByPlaceholderText('メッセージを入力...')).toBeDisabled();
    expect(screen.getByRole('button', { name: '画像をアップロード' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('resumes sending after the disabled reason is cleared', () => {
    const onSend = vi.fn();
    const { rerender } = render(
      <ChatInput
        onSend={onSend}
        onStop={vi.fn()}
        isStreaming={false}
        disabled
        disabledReason="モデル一覧を読み込み中です。"
      />,
    );

    rerender(
      <ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} disabled={false} />,
    );
    const input = screen.getByPlaceholderText('メッセージを入力...');
    fireEvent.change(input, { target: { value: '送信を再開' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onSend).toHaveBeenCalledWith('送信を再開', undefined);
  });
});
