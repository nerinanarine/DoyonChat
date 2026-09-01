import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatMessage from '../../src/components/Chat/ChatMessage';
import { ModelInfo } from '../../src/types';

const models: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Test model',
    quality: 5,
    speed: 'fast',
    cost: 'low',
    supportsMultimodal: false,
    contextLength: '128k',
    bestFor: 'Test',
  },
  {
    id: 'claude-3',
    name: 'Claude 3.5 Sonnet',
    description: 'Test model 2',
    quality: 5,
    speed: 'fast',
    cost: 'low',
    supportsMultimodal: true,
    contextLength: '200k',
    bestFor: 'Test',
  },
];

const assistantMessage = {
  id: 'message-1',
  conversationId: 'conversation-1',
  role: 'assistant' as const,
  content: '最終回答です。',
  reasoning: '検討しました。',
  createdAt: '2026-08-13T00:00:00.000Z',
};

describe('ChatMessage', () => {
  it('renders saved reasoning separately from the final answer', () => {
    render(<ChatMessage message={assistantMessage} />);

    const button = screen.getByRole('button', { name: /思考プロセス/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('最終回答です。')).toBeInTheDocument();
    expect(screen.queryByText('検討しました。')).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(screen.getByText('検討しました。')).toBeInTheDocument();
  });

  it('keeps the existing display when reasoning is absent', () => {
    render(<ChatMessage message={{ ...assistantMessage, reasoning: undefined }} />);

    expect(screen.queryByRole('button', { name: /思考プロセス/ })).not.toBeInTheDocument();
    expect(screen.getByText('最終回答です。')).toBeInTheDocument();
  });

  it('shows "あなた" for user messages when displayName is not set', () => {
    render(
      <ChatMessage
        message={{ ...assistantMessage, role: 'user', content: 'こんにちは' }}
      />,
    );
    expect(screen.getByText('あなた')).toBeInTheDocument();
  });

  it('shows custom displayName for user messages', () => {
    render(
      <ChatMessage
        message={{ ...assistantMessage, role: 'user', content: 'こんにちは' }}
        settings={{ displayName: '田中太郎' }}
      />,
    );
    expect(screen.getByText('田中太郎')).toBeInTheDocument();
  });

  it('shows model display name for assistant messages', () => {
    render(
      <ChatMessage
        message={{ ...assistantMessage, model: 'gpt-4o' }}
        models={models}
      />,
    );
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
  });

  it('falls back to currentModel when message.model is absent', () => {
    render(
      <ChatMessage
        message={{ ...assistantMessage, model: undefined }}
        models={models}
        currentModel="claude-3"
      />,
    );
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
  });

  it('falls back to model ID when not in catalog, and to AI when no model', () => {
    const { rerender } = render(
      <ChatMessage message={{ ...assistantMessage, model: 'unknown-model' }} models={models} />,
    );
    expect(screen.getByText('unknown-model')).toBeInTheDocument();

    rerender(<ChatMessage message={{ ...assistantMessage, model: undefined }} models={models} />);
    expect(screen.getByText('AI')).toBeInTheDocument();
  });
});
