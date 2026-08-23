import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { useChat } from '../../src/hooks/useChat';
import { useConversations } from '../../src/hooks/useConversations';
import * as api from '../../src/services/chatApi';
import { Conversation, ModelInfo } from '../../src/types';

vi.mock('@azure/msal-react', () => ({
  useIsAuthenticated: () => true,
  useMsal: () => ({ instance: { logoutRedirect: vi.fn() } }),
}));
vi.mock('../../src/hooks/useChat', () => ({ useChat: vi.fn() }));
vi.mock('../../src/hooks/useConversations', () => ({ useConversations: vi.fn() }));
vi.mock('../../src/services/chatApi', () => ({ fetchModels: vi.fn() }));

const defaultModel: ModelInfo = {
  id: 'kimi-k2.6',
  name: 'Kimi K2.6',
  description: 'Default model',
  quality: 4,
  speed: 'fast',
  cost: 'low',
  supportsMultimodal: false,
  contextLength: '128k',
  bestFor: 'General use',
};

const createdConversation: Conversation = {
  id: 'created-conversation',
  title: 'New Chat',
  model: defaultModel.id,
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

const create = vi.fn();

function mockHooks(conversations: Conversation[] = []) {
  vi.mocked(useConversations).mockReturnValue({
    conversations,
    loading: false,
    error: null,
    load: vi.fn(),
    create,
    remove: vi.fn(),
    updateModel: vi.fn(),
    updateTitle: vi.fn(),
  });
  vi.mocked(useChat).mockReturnValue({
    messages: [],
    streamingText: '',
    streamingReasoning: '',
    isStreaming: false,
    error: null,
    loadMessages: vi.fn(),
    sendMessage: vi.fn(),
    stop: vi.fn(),
  });
}

describe('App model state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(createdConversation);
    mockHooks();
    vi.mocked(api.fetchModels).mockResolvedValue([defaultModel]);
  });

  it('omits model when creating a new conversation', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '新規チャット' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith('New Chat'));
    expect(create.mock.calls[0]).toHaveLength(1);
  });

  it('omits model when the first message creates a conversation', async () => {
    render(<App />);
    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: '最初のメッセージ' } });

    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith('最初のメッセージ'));
    expect(create.mock.calls[0]).toHaveLength(1);
  });

  it('shows model loading and fetch failure as separate disabled reasons', async () => {
    vi.mocked(api.fetchModels).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('モデル一覧を読み込み中です。');
    expect(screen.getByPlaceholderText('メッセージを入力...')).toBeDisabled();
    unmount();

    vi.mocked(api.fetchModels).mockRejectedValue(new Error('fetch failed'));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('モデル一覧を取得できませんでした。'),
    );
    expect(screen.getByPlaceholderText('メッセージを入力...')).toBeDisabled();
  });

  it('marks a saved model unavailable only after the catalog has loaded', async () => {
    const unavailableConversation = {
      ...createdConversation,
      id: 'unavailable-conversation',
      title: '利用不可モデルの会話',
      model: 'retired-model',
    };
    mockHooks([unavailableConversation]);
    render(<App />);

    const titleButton = screen.getByRole('button', { name: unavailableConversation.title });
    fireEvent.click(titleButton.parentElement as HTMLElement);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '保存済みモデル「retired-model」は利用不可です。利用可能なモデルを再選択してください。',
      ),
    );
    expect(screen.getByRole('button', { name: /retired-model（利用不可）/ })).toBeEnabled();
    expect(screen.getByPlaceholderText('メッセージを入力...')).toBeDisabled();
  });
});
