import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const headerModels: ModelInfo[] = [
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    description: 'Complex coding, general tasks',
    quality: 5,
    speed: 'Fast',
    cost: '★★☆',
    supportsMultimodal: false,
    contextLength: '256K',
    bestFor: 'Coding, reasoning',
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    description: 'OpenCode Go model',
    quality: 3,
    speed: 'Unknown',
    cost: 'See OpenCode Go',
    supportsMultimodal: false,
    contextLength: 'Unknown',
    bestFor: 'General use',
  },
];

const props = {
  activeConversationId: conversation.id,
  settings: {},
  settingsStatus: 'loaded' as const,
  models: [],
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

describe('AppLayout conversation model dropdown (P1-013)', () => {
  it('lists the catalog models with a default option and shows the conversation override', () => {
    render(
      <AppLayout
        {...props}
        models={headerModels}
        activeConversationAgentModel="opencode-go/kimi-k2.6"
        onChangeConversationAgentModel={vi.fn().mockResolvedValue(undefined)}
        conversations={[conversation]}
      />,
    );

    const select = screen.getByRole('combobox', { name: '会話のモデル' });
    expect(select).toHaveValue('opencode-go/kimi-k2.6');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map((option) => option.value)).toEqual([
      '',
      'opencode-go/kimi-k2.6',
      'opencode-go/grok-4.6',
    ]);
    expect(options[0].textContent).toBe('既定に戻す');
  });

  it('falls back to the user setting when the conversation has no override', () => {
    render(
      <AppLayout
        {...props}
        models={headerModels}
        settings={{ agentModel: 'opencode-go/grok-4.6' }}
        conversations={[conversation]}
      />,
    );

    expect(screen.getByRole('combobox', { name: '会話のモデル' })).toHaveValue(
      'opencode-go/grok-4.6',
    );
  });

  it('persists a selected model and clears it back to default', () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <AppLayout
        {...props}
        models={headerModels}
        activeConversationAgentModel={null}
        onChangeConversationAgentModel={onChange}
        conversations={[conversation]}
      />,
    );

    const select = screen.getByRole('combobox', { name: '会話のモデル' });
    fireEvent.change(select, { target: { value: 'opencode-go/kimi-k2.6' } });
    expect(onChange).toHaveBeenCalledWith('opencode-go/kimi-k2.6');

    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('disables the dropdown without an active conversation', () => {
    render(
      <AppLayout
        {...props}
        activeConversationId={null}
        models={headerModels}
        onChangeConversationAgentModel={vi.fn().mockResolvedValue(undefined)}
        conversations={[]}
      />,
    );

    expect(screen.getByRole('combobox', { name: '会話のモデル' })).toBeDisabled();
  });
});
