import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsMenu from '../../src/components/Settings/SettingsMenu';
import { ModelInfo } from '../../src/types';

const models: ModelInfo[] = [
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
  {
    id: 'model-2',
    name: 'Model 2',
    description: 'Test model 2',
    quality: 3,
    speed: 'medium',
    cost: 'high',
    supportsMultimodal: false,
    contextLength: '256k',
    bestFor: 'Test',
  },
];

const props = {
  models,
  modelsStatus: 'loaded' as const,
  settings: {},
  settingsStatus: 'loaded' as const,
  settingsError: null,
  onChangeDefaultModel: vi.fn().mockResolvedValue(undefined),
  onChangeDisplayName: vi.fn().mockResolvedValue(undefined),
  onLogout: vi.fn(),
};

function openMenu() {
  render(<SettingsMenu {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
}

describe('SettingsMenu', () => {
  it('shows the default model selector and logout button when opened', () => {
    openMenu();
    expect(
      screen.getByRole('combobox', { name: 'デフォルトのモデル' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
  });

  it('fires onLogout when the logout button is clicked', () => {
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(props.onLogout).toHaveBeenCalledTimes(1);
  });

  it('selects a default model and clears it via the empty option', async () => {
    openMenu();
    const select = screen.getByRole('combobox', { name: 'デフォルトのモデル' });

    fireEvent.change(select, { target: { value: 'model-2' } });
    await vi.waitFor(() =>
      expect(props.onChangeDefaultModel).toHaveBeenCalledWith('model-2'),
    );

    fireEvent.change(select, { target: { value: '' } });
    await vi.waitFor(() => expect(props.onChangeDefaultModel).toHaveBeenCalledWith(null));
  });

  it('disables the selector while models or settings are loading', () => {
    render(
      <SettingsMenu
        {...props}
        modelsStatus="loading"
        settingsStatus="loading"
        settings={{}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    expect(
      screen.getByRole('combobox', { name: 'デフォルトのモデル' }),
    ).toBeDisabled();
    expect(screen.getByText(/モデル一覧を読み込み中です。/)).toBeInTheDocument();
    expect(screen.getByText(/設定を読み込み中です。/)).toBeInTheDocument();
  });

  it('marks a saved defaultModel not in the catalog as unavailable', () => {
    render(
      <SettingsMenu
        {...props}
        settings={{ defaultModel: 'retired-model' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    expect(screen.getByText(/retired-model/)).toBeInTheDocument();
    expect(screen.getByText(/利用不可です。再選択してください。/)).toBeInTheDocument();
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

  it('saves the agent model on blur and clears it when emptied', async () => {
    render(<SettingsMenu {...agentProps} settings={{ agentModel: 'claude-sonnet-4' }} />);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const input = screen.getByLabelText('エージェントのモデル') as HTMLInputElement;
    expect(input.value).toBe('claude-sonnet-4');
    fireEvent.change(input, { target: { value: ' gemini-2.5-pro ' } });
    fireEvent.blur(input);
    await vi.waitFor(() =>
      expect(agentProps.onChangeAgentModel).toHaveBeenCalledWith('gemini-2.5-pro'),
    );

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    await vi.waitFor(() => expect(agentProps.onChangeAgentModel).toHaveBeenCalledWith(null));
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