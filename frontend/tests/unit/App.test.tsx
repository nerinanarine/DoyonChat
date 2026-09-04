import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { useChat } from '../../src/hooks/useChat';
import { useConversations } from '../../src/hooks/useConversations';
import { useSettings } from '../../src/hooks/useSettings';
import * as api from '../../src/services/chatApi';
import { Conversation, ModelInfo } from '../../src/types';

vi.mock('@azure/msal-react', () => ({
  useIsAuthenticated: () => true,
  useMsal: () => ({ instance: { logoutRedirect: vi.fn() } }),
}));
vi.mock('../../src/hooks/useChat', () => ({ useChat: vi.fn() }));
vi.mock('../../src/hooks/useConversations', () => ({
  useConversations: vi.fn(),
  NEW_CHAT_TITLE: 'New Chat',
}));
vi.mock('../../src/hooks/useSettings', () => ({ useSettings: vi.fn() }));
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
const sendMessage = vi.fn();
const autoTitle = vi.fn();
const isRenamed = vi.fn();
const updateSettings = vi.fn().mockResolvedValue(undefined);
const loadMessages = vi.fn();
const clearChat = vi.fn();

function mockHooks(
  conversations: Conversation[] = [],
  settings: ModelInfo['id'] | undefined = undefined,
) {
  vi.mocked(useConversations).mockReturnValue({
    conversations,
    loading: false,
    error: null,
    load: vi.fn(),
    create,
    remove: vi.fn(),
    updateModel: vi.fn(),
    updateTitle: vi.fn(),
    autoTitle,
    isRenamed,
  });
  vi.mocked(useChat).mockReturnValue({
    messages: [],
    streamingText: '',
    streamingReasoning: '',
    agentProgress: [],
    approvalRequest: null,
    approvalBusy: false,
    isStreaming: false,
    error: null,
    messagesLoading: false,
    loadError: null,
    loadMessages,
    sendMessage,
    retrySend: vi.fn(),
    stop: vi.fn(),
    dismissError: vi.fn(),
    respondApproval: vi.fn(),
    clearChat,
  });
  vi.mocked(useSettings).mockReturnValue({
    settings: settings === undefined ? {} : { defaultModel: settings },
    status: 'loaded',
    error: null,
    updateSettings,
    reload: vi.fn(),
  });
}

describe('App model state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(createdConversation);
    autoTitle.mockResolvedValue(undefined);
    isRenamed.mockReturnValue(false);
    mockHooks();
    vi.mocked(api.fetchModels).mockResolvedValue([defaultModel]);
  });

  it('clears the chat view when starting a new chat from an existing conversation', async () => {
    mockHooks([{ ...createdConversation, id: 'existing-conversation', title: '既存トーク' }]);
    render(<App />);
    fireEvent.click(
      (await screen.findByRole('button', { name: '既存トーク' })).parentElement as HTMLElement,
    );
    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith('existing-conversation'));

    clearChat.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '新規チャット' }));

    await waitFor(() => expect(clearChat).toHaveBeenCalled());
    // 新規チャットでは過去会話の再読込を行わない
    expect(loadMessages).toHaveBeenCalledTimes(1);
  });

  it('does not create a conversation when the new chat button is clicked', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));

    await waitFor(() => expect(create).not.toHaveBeenCalled());
    // 一覧に仮行は追加されない
    expect(screen.queryAllByRole('listitem').length).toBe(0);
  });

  it('uses the saved defaultModel as the initial draft model', async () => {
    mockHooks([], 'glm-5.1');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));

    // モデルメニューに draftModel のID（利用不可扱い）が出る
    expect(await screen.findByRole('button', { name: /glm-5\.1/i })).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows a neutral header label when no conversation and no draft model are set', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));

    // settings が空（defaultModel なし）でも「undefined（利用不可）」ではなく中立ラベルを出す
    expect(await screen.findByRole('button', { name: 'モデル未選択' })).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('updates draft model without calling the backend when no conversation is selected', async () => {
    const updateModel = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useConversations).mockReturnValue({
      conversations: [],
      loading: false,
      error: null,
      load: vi.fn(),
      create,
      remove: vi.fn(),
      updateModel,
      updateTitle: vi.fn(),
      autoTitle,
      isRenamed,
    });
    vi.mocked(useSettings).mockReturnValue({
      settings: { defaultModel: 'kimi-k2.6' },
      status: 'loaded',
      error: null,
      updateSettings,
      reload: vi.fn(),
    });
    vi.mocked(api.fetchModels).mockResolvedValue([
      defaultModel,
      { ...defaultModel, id: 'glm-5.1', name: 'GLM-5.1', description: 'GLM model' },
    ]);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));
    fireEvent.click(await screen.findByRole('button', { name: /Kimi K2.6/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /GLM-5.1/ }));

    await waitFor(() => expect(updateModel).not.toHaveBeenCalled());
    // draft model が反映され、初回送信に使われる
    const input = await screen.findByPlaceholderText('メッセージを入力...');
    fireEvent.change(input, { target: { value: 'draft message' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith('draft message', 'glm-5.1'));
  });

  it('uses the saved defaultModel when the first message creates a conversation', async () => {
    mockHooks([], 'glm-5.1');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));
    const input = await screen.findByPlaceholderText('メッセージを入力...');
    fireEvent.change(input, { target: { value: '最初のメッセージ' } });

    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith('最初のメッセージ', 'glm-5.1'));
  });

  it('omits model when the first message creates a conversation', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));
    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: '最初のメッセージ' } });

    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith('最初のメッセージ'));
    expect(create.mock.calls[0]).toHaveLength(1);
  });

  it('sends the first message using the newly created conversation id', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));
    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: '最初のメッセージ' } });

    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        '最初のメッセージ',
        undefined,
        'created-conversation',
      ),
    );
  });

  it('shows a bootstrap loading state while data is loading and an error state with retry on failure', async () => {
    vi.mocked(api.fetchModels).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('データを読み込み中...');
    expect(screen.queryByPlaceholderText('メッセージを入力...')).not.toBeInTheDocument();
    unmount();

    vi.mocked(api.fetchModels).mockRejectedValue(new Error('fetch failed'));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '初期データの読み込みに失敗しました。接続を確認して再試行してください。',
      ),
    );
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
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

    const titleButton = await screen.findByRole('button', { name: unavailableConversation.title });
    fireEvent.click(titleButton.parentElement as HTMLElement);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '保存済みモデル「retired-model」は利用不可です。利用可能なモデルを再選択してください。',
      ),
    );
    expect(screen.getByRole('button', { name: /retired-model（利用不可）/ })).toBeEnabled();
    expect(screen.getByPlaceholderText('メッセージを入力...')).toBeDisabled();
  });

  it('triggers auto title with the created conversation id after the first message', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新規チャット' }));
    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: '最初のメッセージ' } });

    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() =>
      expect(autoTitle).toHaveBeenCalledWith('created-conversation', '最初のメッセージ'),
    );
  });

  it('triggers auto title when the active conversation is still New Chat', async () => {
    mockHooks([{ ...createdConversation, id: 'existing-conversation', title: 'New Chat' }]);
    render(<App />);
    fireEvent.click(
      (await screen.findByRole('button', { name: 'New Chat' })).parentElement as HTMLElement,
    );

    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: '二通目のメッセージ' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() =>
      expect(autoTitle).toHaveBeenCalledWith('existing-conversation', '二通目のメッセージ'),
    );
  });

  it('skips auto title for a manually renamed conversation', async () => {
    mockHooks([{ ...createdConversation, id: 'existing-conversation', title: 'New Chat' }]);
    isRenamed.mockReturnValue(true);
    render(<App />);
    fireEvent.click(
      (await screen.findByRole('button', { name: 'New Chat' })).parentElement as HTMLElement,
    );

    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'メッセージ' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    expect(autoTitle).not.toHaveBeenCalled();
  });

  it('skips auto title when the active conversation already has a custom title', async () => {
    mockHooks([{ ...createdConversation, id: 'existing-conversation', title: '設定済みタイトル' }]);
    render(<App />);
    fireEvent.click(
      (await screen.findByRole('button', { name: '設定済みタイトル' })).parentElement as HTMLElement,
    );

    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'メッセージ' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    expect(autoTitle).not.toHaveBeenCalled();
  });
});
