import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessageList from '../../src/components/Chat/ChatMessageList';

const models = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Test',
    quality: 5,
    speed: 'fast',
    cost: 'low',
    supportsMultimodal: false,
    contextLength: '128k',
    bestFor: 'Test',
  },
];

const settings = { displayName: 'Alice' };

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

  it('shows model name during streaming using currentModel', () => {
    render(
      <ChatMessageList
        messages={[]}
        streamingText="回答中"
        streamingReasoning=""
        isStreaming
        models={models}
        currentModel="gpt-4o"
      />,
    );
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
  });

  it('passes displayName and model fallback to ChatMessage', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'm1',
            conversationId: 'c1',
            role: 'user',
            content: 'こんにちは',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
          {
            id: 'm2',
            conversationId: 'c1',
            role: 'assistant',
            content: '返答',
            createdAt: '2026-09-01T00:01:00.000Z',
          },
        ]}
        streamingText=""
        streamingReasoning=""
        isStreaming={false}
        models={models}
        settings={settings}
        currentModel="gpt-4o"
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
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
