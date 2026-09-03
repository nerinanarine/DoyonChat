import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMsal } from '@azure/msal-react';
import AppLayout from '../../src/components/Layout/AppLayout';
import { Conversation, ModelInfo } from '../../src/types';

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
  modelsStatus: 'loaded' as const,
  settings: {},
  settingsStatus: 'loaded' as const,
  settingsError: null,
  onChangeDefaultModel: vi.fn().mockResolvedValue(undefined),
  onChangeDisplayName: vi.fn().mockResolvedValue(undefined),
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

describe('AppLayout model state', () => {
  it('shows loading and fetch failure separately without marking the saved model unavailable', () => {
    const { rerender } = render(
      <AppLayout {...props} models={[]} modelsStatus="loading" conversations={[conversation]} />,
    );

    expect(screen.getByRole('button', { name: /モデルを読み込み中/ })).toBeDisabled();
    expect(screen.queryByText(/利用不可/)).not.toBeInTheDocument();

    rerender(
      <AppLayout {...props} models={[]} modelsStatus="error" conversations={[conversation]} />,
    );

    expect(screen.getByRole('button', { name: /モデル一覧を取得できません/ })).toBeDisabled();
    expect(screen.queryByText(/利用不可/)).not.toBeInTheDocument();
  });

  it('shows the saved unavailable ID and still allows selecting an available model', () => {
    const onChangeModel = vi.fn();
    const unavailableConversation = { ...conversation, model: 'retired-model' };
    const { rerender } = render(
      <AppLayout
        {...props}
        conversations={[unavailableConversation]}
        onChangeModel={onChangeModel}
      />,
    );

    const selector = screen.getByRole('button', { name: /retired-model（利用不可）/ });
    expect(selector).toBeEnabled();
    fireEvent.click(selector);
    fireEvent.click(screen.getByRole('menuitem', { name: /Model 1/ }));
    expect(onChangeModel).toHaveBeenCalledWith('model-1');

    rerender(
      <AppLayout
        {...props}
        conversations={[{ ...unavailableConversation, model: 'model-1' }]}
        onChangeModel={onChangeModel}
      />,
    );
    expect(screen.getByRole('button', { name: /Model 1/ })).toBeEnabled();
    expect(screen.queryByText(/利用不可/)).not.toBeInTheDocument();
  });

  it('shows all 27 loaded models once each', () => {
    const models: ModelInfo[] = Array.from({ length: 27 }, (_, index) => ({
      id: `model-${index + 1}`,
      name: `Model ${index + 1}`,
      description: `Model ${index + 1} description`,
      quality: 3,
      speed: 'Unknown',
      cost: 'See OpenCode Go',
      supportsMultimodal: false,
      contextLength: 'Unknown',
      bestFor: 'General use',
    }));
    render(<AppLayout {...props} models={models} conversations={[conversation]} />);

    fireEvent.click(screen.getByRole('button', { name: /Model 1/ }));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items).toHaveLength(27);
    expect(new Set(items.map((item) => item.textContent)).size).toBe(27);
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
