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

describe('AppLayout sidebar resize', () => {
  const STORAGE_KEY = 'doyonchat.sidebarWidth';

  afterEach(() => {
    localStorage.clear();
  });

  it('renders a keyboard-operable separator with the default width', () => {
    render(<AppLayout {...props} conversations={[conversation]} />);

    const handle = screen.getByRole('separator', { name: 'サイドバー幅を調整' });
    expect(handle).toHaveAttribute('aria-valuenow', '256');
    expect(handle).toHaveAttribute('aria-valuemin', '200');
    expect(handle).toHaveAttribute('aria-valuemax', '480');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('resizes with the arrow keys and persists the width', () => {
    render(<AppLayout {...props} conversations={[conversation]} />);
    const handle = screen.getByRole('separator', { name: 'サイドバー幅を調整' });

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '272');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('272');

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '240');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('240');
  });

  it('clamps the width between 200 and 480 and restores a saved value', () => {
    localStorage.setItem(STORAGE_KEY, '9999');
    const first = render(<AppLayout {...props} conversations={[conversation]} />);
    expect(screen.getByRole('separator', { name: 'サイドバー幅を調整' })).toHaveAttribute(
      'aria-valuenow',
      '480',
    );
    first.unmount();

    localStorage.setItem(STORAGE_KEY, '10');
    render(<AppLayout {...props} conversations={[conversation]} />);
    expect(screen.getByRole('separator', { name: 'サイドバー幅を調整' })).toHaveAttribute(
      'aria-valuenow',
      '200',
    );
  });

  it('resizes by dragging the handle', () => {
    render(<AppLayout {...props} conversations={[conversation]} />);
    const handle = screen.getByRole('separator', { name: 'サイドバー幅を調整' });

    // jsdom の PointerEvent は clientX を保持しないため MouseEvent を pointer 名で発火する
    const firePointer = (type: string, clientX: number) => {
      fireEvent(handle, new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
    };
    firePointer('pointerdown', 300);
    firePointer('pointermove', 340);
    firePointer('pointerup', 340);

    expect(handle).toHaveAttribute('aria-valuenow', '296');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('296');
  });
});
