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
});