import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsMenu from '../../src/components/Settings/SettingsMenu';
import { ModelInfo } from '../../src/types';

const models: ModelInfo[] = [
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
  settings: {},
  settingsStatus: 'loaded' as const,
  models,
  onChangeDisplayName: vi.fn().mockResolvedValue(undefined),
  onLogout: vi.fn(),
};

function openMenu() {
  render(<SettingsMenu {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
}

describe('SettingsMenu', () => {
  it('shows the display name input and logout button when opened', () => {
    openMenu();
    expect(screen.getByLabelText('表示名')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
  });

  it('does not render a default model selector (J2)', () => {
    openMenu();
    expect(screen.queryByRole('combobox', { name: 'デフォルトのモデル' })).not.toBeInTheDocument();
    expect(screen.queryByText('デフォルトモデル')).not.toBeInTheDocument();
  });

  it('fires onLogout when the logout button is clicked', () => {
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(props.onLogout).toHaveBeenCalledTimes(1);
  });

  it('shows displayName input and saves on blur', async () => {
    render(<SettingsMenu {...props} settings={{ displayName: 'Alice' }} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const input = screen.getByLabelText('表示名') as HTMLInputElement;
    expect(input.value).toBe('Alice');

    fireEvent.change(input, { target: { value: 'Bob' } });
    fireEvent.blur(input);
    await vi.waitFor(() => expect(props.onChangeDisplayName).toHaveBeenCalledWith('Bob'));
  });

  it('clears displayName when input is emptied', async () => {
    render(<SettingsMenu {...props} settings={{ displayName: 'Alice' }} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const input = screen.getByLabelText('表示名');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    await vi.waitFor(() => expect(props.onChangeDisplayName).toHaveBeenCalledWith(null));
  });

  it('saves displayName on Enter key', async () => {
    render(<SettingsMenu {...props} settings={{}} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const input = screen.getByLabelText('表示名');
    fireEvent.change(input, { target: { value: 'Charlie' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(props.onChangeDisplayName).toHaveBeenCalledWith('Charlie'));
  });
});

describe('SettingsMenu agent settings', () => {
  const agentProps = {
    ...props,
    onChangeAgentApprovalLevel: vi.fn().mockResolvedValue(undefined),
    onChangeAgentModel: vi.fn().mockResolvedValue(undefined),
    onChangeAgentSubagentModel: vi.fn().mockResolvedValue(undefined),
  };

  it('saves the approval level from the selector', async () => {
    render(<SettingsMenu {...agentProps} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const select = screen.getByRole('combobox', { name: 'エージェントのツール確認レベル' });
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'always' } });
    await vi.waitFor(() =>
      expect(agentProps.onChangeAgentApprovalLevel).toHaveBeenCalledWith('always'),
    );

    fireEvent.change(select, { target: { value: '' } });
    await vi.waitFor(() =>
      expect(agentProps.onChangeAgentApprovalLevel).toHaveBeenCalledWith(null),
    );
  });

  it('reflects the saved approval level in the selector', () => {
    render(<SettingsMenu {...props} settings={{ agentApprovalLevel: 'auto' }} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(
      screen.getByRole('combobox', { name: 'エージェントのツール確認レベル' }),
    ).toHaveValue('auto');
  });

  it('saves the selected agent model and clears it when reset to default', async () => {
    render(<SettingsMenu {...agentProps} settings={{ agentModel: 'opencode-go/kimi-k2.6' }} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const select = screen.getByRole('combobox', { name: 'エージェントのモデル' });
    expect(select).toHaveValue('opencode-go/kimi-k2.6');

    fireEvent.change(select, { target: { value: 'opencode-go/grok-4.6' } });
    await vi.waitFor(() =>
      expect(agentProps.onChangeAgentModel).toHaveBeenCalledWith('opencode-go/grok-4.6'),
    );

    fireEvent.change(select, { target: { value: '' } });
    await vi.waitFor(() => expect(agentProps.onChangeAgentModel).toHaveBeenCalledWith(null));
  });

  it('lists every catalog model by name with a qualified value and a default option', () => {
    render(<SettingsMenu {...agentProps} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const select = screen.getByRole('combobox', { name: 'エージェントのモデル' });
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map((option) => option.value)).toEqual([
      '',
      'opencode-go/kimi-k2.6',
      'opencode-go/grok-4.6',
    ]);
    expect(options.map((option) => option.textContent)).toEqual([
      '未設定（pi の既定）',
      'Kimi K2.6',
      'Grok 4.6',
    ]);
  });

  it('saves the subagent model on Enter key', async () => {
    render(<SettingsMenu {...agentProps} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const input = screen.getByLabelText('サブエージェントのモデル');
    fireEvent.change(input, { target: { value: 'deepseek-v4-flash' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() =>
      expect(agentProps.onChangeAgentSubagentModel).toHaveBeenCalledWith('deepseek-v4-flash'),
    );
  });
});
