import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatInput from '../../src/components/Chat/ChatInput';

describe('ChatInput disabled reason', () => {
  it('shows the reason and blocks text and send controls', () => {
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
    expect(onSend).toHaveBeenCalledWith('送信を再開');
  });
});

describe('ChatInput text-only composer', () => {
  it('does not render an image attach control', () => {
    render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />);

    expect(screen.queryByRole('button', { name: '画像をアップロード' })).not.toBeInTheDocument();
  });

  it('sends the trimmed text without any image payload', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    const input = screen.getByPlaceholderText('メッセージを入力...');
    fireEvent.change(input, { target: { value: '  エージェントへ依頼  ' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    expect(onSend).toHaveBeenCalledWith('エージェントへ依頼');
  });
});
