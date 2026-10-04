import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentsMdEditor, {
  DEFAULT_AGENTS_MD,
} from '../../src/components/Settings/AgentsMdEditor';
import * as api from '../../src/services/chatApi';

vi.mock('../../src/services/chatApi', () => ({
  fetchAgentsMd: vi.fn(),
  updateAgentsMd: vi.fn(),
}));

const onClose = vi.fn();

describe('AgentsMdEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchAgentsMd).mockResolvedValue({ userId: 'alice', content: '# 現在の指示' });
    vi.mocked(api.updateAgentsMd).mockImplementation(async (content: string) => ({
      userId: 'alice',
      content,
    }));
  });

  it('loads and shows the current content', async () => {
    render(<AgentsMdEditor onClose={onClose} />);

    const textarea = (await screen.findByLabelText('AGENTS.md の内容')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('# 現在の指示');
    expect(screen.queryByText(/未設定です/)).not.toBeInTheDocument();
  });

  it('shows the default text when the document is unset', async () => {
    vi.mocked(api.fetchAgentsMd).mockResolvedValue(null);
    render(<AgentsMdEditor onClose={onClose} />);

    const textarea = await screen.findByLabelText('AGENTS.md の内容');
    expect(textarea).toHaveValue('');
    expect(textarea).toHaveAttribute('placeholder', DEFAULT_AGENTS_MD);
    expect(screen.getByText(/未設定です/)).toBeInTheDocument();
  });

  it('saves edited content and shows success feedback', async () => {
    render(<AgentsMdEditor onClose={onClose} />);
    const textarea = await screen.findByLabelText('AGENTS.md の内容');

    fireEvent.change(textarea, { target: { value: '# 編集後' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(api.updateAgentsMd).toHaveBeenCalledWith('# 編集後'));
    expect(await screen.findByText('保存しました')).toBeInTheDocument();
  });

  it('shows an error message when saving fails', async () => {
    vi.mocked(api.updateAgentsMd).mockRejectedValue(new Error('save failed'));
    render(<AgentsMdEditor onClose={onClose} />);
    const textarea = await screen.findByLabelText('AGENTS.md の内容');

    fireEvent.change(textarea, { target: { value: '# 編集後' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('通信に失敗しました');
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument();
  });

  it('clears the document by saving an empty value', async () => {
    render(<AgentsMdEditor onClose={onClose} />);
    const textarea = await screen.findByLabelText('AGENTS.md の内容');

    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(api.updateAgentsMd).toHaveBeenCalledWith(''));
    expect(await screen.findByText(/未設定です/)).toBeInTheDocument();
  });

  it('shows a loading state while fetching', () => {
    vi.mocked(api.fetchAgentsMd).mockReturnValue(new Promise(() => {}));
    render(<AgentsMdEditor onClose={onClose} />);

    expect(screen.getByRole('status')).toHaveTextContent('AGENTS.md を読み込み中...');
  });

  it('recovers from a load error when retry is pressed', async () => {
    vi.mocked(api.fetchAgentsMd)
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce({ userId: 'alice', content: '# 再読み込み後の指示' });
    render(<AgentsMdEditor onClose={onClose} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('通信に失敗しました');
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));

    const textarea = await screen.findByLabelText('AGENTS.md の内容');
    expect(textarea).toHaveValue('# 再読み込み後の指示');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes from the close button', async () => {
    render(<AgentsMdEditor onClose={onClose} />);
    await screen.findByLabelText('AGENTS.md の内容');

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
