import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatMessage from '../../src/components/Chat/ChatMessage';

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
});
