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

describe('ChatInput agent mode image restriction', () => {
  it('disables image attach with an explicit reason while text sending still works', () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        onStop={vi.fn()}
        isStreaming={false}
        imageDisabledReason="エージェントモードはテキストのみ対応のため、画像は添付できません。"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'エージェントモードはテキストのみ対応のため、画像は添付できません。',
    );
    const imageButton = screen.getByRole('button', { name: '画像をアップロード' });
    expect(imageButton).toBeDisabled();
    expect(imageButton).toHaveAttribute(
      'title',
      'エージェントモードはテキストのみ対応のため、画像は添付できません。',
    );

    // テキスト送信は通常どおり行える
    const input = screen.getByPlaceholderText('メッセージを入力...');
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'エージェントへ依頼' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    expect(onSend).toHaveBeenCalledWith('エージェントへ依頼', undefined);
  });

  it('applies the image restriction when toggled while composing a draft', () => {
    const onSend = vi.fn();
    const { rerender } = render(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);

    // プレビューありの状態を再現（image ステートは内部のため、送信で確認する）
    const input = screen.getByPlaceholderText('メッセージを入力...');
    fireEvent.change(input, { target: { value: '添付あり' } });

    rerender(
      <ChatInput
        onSend={onSend}
        onStop={vi.fn()}
        isStreaming={false}
        imageDisabledReason="エージェントモードはテキストのみ対応のため、画像は添付できません。"
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '画像をアップロード' })).toBeDisabled();
  });

  it('allows image attach again once the restriction clears', () => {
    const onSend = vi.fn();
    const { rerender } = render(
      <ChatInput
        onSend={onSend}
        onStop={vi.fn()}
        isStreaming={false}
        imageDisabledReason="エージェントモードはテキストのみ対応のため、画像は添付できません。"
      />,
    );

    rerender(<ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />);
    expect(screen.getByRole('button', { name: '画像をアップロード' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
