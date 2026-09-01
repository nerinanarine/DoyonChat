import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessageList from '../../src/components/Chat/ChatMessageList';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ChatMessageList', () => {
  it('renders streaming reasoning separately from streaming content', () => {
    render(
      <ChatMessageList
        messages={[]}
        streamingText="最終回答"
        streamingReasoning="思考中"
        isStreaming
      />,
    );

    expect(screen.getByRole('button', { name: /思考プロセス/ })).toBeInTheDocument();
    expect(screen.getByText('最終回答')).toBeInTheDocument();
    expect(screen.queryByText('思考中')).not.toBeInTheDocument();
  });

  it('shows an accessible loading state while messages are being fetched', () => {
    render(
      <ChatMessageList
        messages={[]}
        streamingText=""
        streamingReasoning=""
        isStreaming={false}
        loading
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('メッセージを読み込み中...');
  });

  it('does not mix another conversation when loading is active', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'old-1',
            conversationId: 'previous',
            role: 'assistant',
            content: '別会話のメッセージ',
            createdAt: '2026-08-22T00:00:00.000Z',
          },
        ]}
        streamingText=""
        streamingReasoning=""
        isStreaming={false}
        loading
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('別会話のメッセージ')).not.toBeInTheDocument();
  });
});
