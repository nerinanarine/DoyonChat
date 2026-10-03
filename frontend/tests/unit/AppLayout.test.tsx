import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMsal } from '@azure/msal-react';
import AppLayout from '../../src/components/Layout/AppLayout';
import { Conversation } from '../../src/types';

vi.mock('@azure/msal-react', () => ({
  useMsal: vi.fn(() => ({ instance: { logoutRedirect: vi.fn() } })),
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
  settings: {},
  settingsStatus: 'loaded' as const,
  onChangeDisplayName: vi.fn().mockResolvedValue(undefined),
  onSelectConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  onRenameConversation: vi.fn().mockResolvedValue(undefined),
  onNewChat: vi.fn(),
  children: <div>chat</div>,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe('AppLayout header', () => {
  it('does not render a model selection dropdown (FR-002)', () => {
    render(<AppLayout {...props} conversations={[conversation]} />);

    expect(screen.queryByRole('button', { name: /モデル/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('AppLayout settings menu', () => {
  it('shows the settings button and hides the logout button when auth is enabled', () => {
    vi.stubEnv('VITE_AUTH_ENABLED', 'true');
    render(<AppLayout {...props} conversations={[conversation]} />);

    expect(screen.getByRole('button', { name: '設定' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
  });

  it('opens the settings menu and logs out from inside it', () => {
    vi.stubEnv('VITE_AUTH_ENABLED', 'true');
    const onLogout = vi.fn();
    vi.mocked(useMsal).mockReturnValue({ instance: { logoutRedirect: onLogout } } as never);
    render(<AppLayout {...props} conversations={[conversation]} />);

    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('AppLayout agent mode (toggle removed)', () => {
  it('does not render the agent toggle', () => {
    render(
      <AppLayout
        {...props}
        conversations={[{ ...conversation, agentMode: true }]}
      />,
    );
    expect(screen.queryByRole('switch', { name: /エージェント/ })).not.toBeInTheDocument();
  });
});
