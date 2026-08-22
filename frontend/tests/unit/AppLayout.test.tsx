import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppLayout from '../../src/components/Layout/AppLayout';
import { Conversation } from '../../src/types';

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ instance: { logoutRedirect: vi.fn() } }),
}));

const conversation: Conversation = {
  id: 'conversation-1',
  title: '元タイトル',
  model: 'model-1',
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
};

const props = {
  activeConversationId: conversation.id,
  models: [
    {
      id: 'model-1',
      name: 'Model 1',
      description: 'Test model',
      quality: 4,
      speed: 'fast',
      cost: 'low',
      supportsMultimodal: false,
      contextLength: '128k',
      bestFor: 'Test',
    },
  ],
  onSelectConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  onRenameConversation: vi.fn().mockResolvedValue(undefined),
  onNewChat: vi.fn(),
  onChangeModel: vi.fn(),
  children: <div>chat</div>,
};

describe('AppLayout conversation title', () => {
  it('updates the active conversation heading when conversation state changes', () => {
    const { rerender } = render(<AppLayout {...props} conversations={[conversation]} />);
    expect(screen.getByRole('heading', { name: '元タイトル' })).toBeInTheDocument();

    rerender(
      <AppLayout
        {...props}
        conversations={[{ ...conversation, title: '更新後タイトル' }]}
      />,
    );

    expect(screen.getByRole('heading', { name: '更新後タイトル' })).toBeInTheDocument();
  });
});
