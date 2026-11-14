import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsDialog from '../../src/components/Settings/SettingsDialog';

const props = {
  settings: {},
  settingsStatus: 'loaded' as const,
  onChangeDisplayName: vi.fn().mockResolvedValue(undefined),
  onLogout: vi.fn(),
  open: true,
  onClose: vi.fn(),
};

describe('SettingsDialog', () => {
  it('renders the shared settings content when open', () => {
    render(<SettingsDialog {...props} />);

    expect(screen.getByRole('dialog', { name: '設定' })).toBeInTheDocument();
    expect(screen.getByLabelText('表示名')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<SettingsDialog {...props} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SettingsDialog {...props} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a background click but not on a click inside the dialog', () => {
    const onClose = vi.fn();
    render(<SettingsDialog {...props} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog', { name: '設定' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog', { name: '設定' }).parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', () => {
    const onClose = vi.fn();
    render(<SettingsDialog {...props} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
