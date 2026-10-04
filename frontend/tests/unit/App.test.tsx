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

const testModel: ModelInfo = {
  id: 'kimi-k2.6',
  name: 'Kimi K2.6',
  description: 'Test model',
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
  model: testModel.id,
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
  chatOverrides: Partial<ReturnType<typeof useChat>> = {},
) {
  vi.mocked(useConversations).mockReturnValue({
    conversations,
    loading: false,
    error: null,
    load: vi.fn(),
    create,
    remove: vi.fn(),
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
    agentStarting: false,
    error: null,
    messagesLoading: false,
    loadError: null,
    loadMessages,
    sendMessage,
    retrySend: vi.fn(),
    retry: vi.fn(),
    stop: vi.fn(),
    dismissError: vi.fn(),
    respondApproval: vi.fn(),
    clearChat,
    ...chatOverrides,
  });
  vi.mocked(useSettings).mockReturnValue({
    userId: 'test-user',
    settings: {},
    status: 'loaded',
    error: null,
    updateSettings,
    reload: vi.fn(),
  });
}

describe('App chat bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(createdConversation);
    autoTitle.mockResolvedValue(undefined);
    isRenamed.mockReturnValue(false);
    mockHooks();
    vi.mocked(api.fetchModels).mockResolvedValue([testModel]);
  });

  it('does not render a header model selection dropdown (FR-002)', async () => {
    render(<App />);
    await screen.findByRole('button', { name: '新規チャット' });

    expect(screen.queryByRole('button', { name: /Kimi K2\.6/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
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

  it('creates the conversation from the first message text only', async () => {
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
      expect(sendMessage).toHaveBeenCalledWith('最初のメッセージ', 'created-conversation'),
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

describe('App agent mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(createdConversation);
    autoTitle.mockResolvedValue(undefined);
    isRenamed.mockReturnValue(false);
    mockHooks();
    vi.mocked(api.fetchModels).mockResolvedValue([testModel]);
  });

  it('does not render the agent mode toggle or an image attach control', async () => {
    mockHooks([
      { ...createdConversation, id: 'agent-conv', title: 'エージェント会話', agentMode: true },
    ]);
    render(<App />);
    fireEvent.click(
      (await screen.findByRole('button', { name: 'エージェント会話' })).parentElement as HTMLElement,
    );

    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith('agent-conv'));
    expect(screen.queryByRole('switch', { name: /エージェント/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '画像をアップロード' })).not.toBeInTheDocument();
  });

  it('keeps chat input enabled for agent conversations with an unavailable saved model (RG-2 F3)', async () => {
    mockHooks([
      {
        ...createdConversation,
        id: 'agent-conv-unavailable-model',
        title: 'エージェント会話（モデル不在）',
        model: 'retired-model',
        agentMode: true,
      },
    ]);
    render(<App />);
    fireEvent.click(
      (await screen.findByRole('button', { name: 'エージェント会話（モデル不在）' })).parentElement as HTMLElement,
    );

    const input = await screen.findByPlaceholderText('メッセージを入力...');
    await waitFor(() => expect(input).toBeEnabled());
    // モデル不在の警告（role=status）は出ない
    expect(
      screen.queryByText(/保存済みモデル「retired-model」は利用不可です/),
    ).not.toBeInTheDocument();
  });
});

describe('App agent startup loading (P2-018)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(createdConversation);
    autoTitle.mockResolvedValue(undefined);
    isRenamed.mockReturnValue(false);
    vi.mocked(api.fetchModels).mockResolvedValue([testModel]);
  });

  it('shows the agent startup loading state while the gateway cold-starts', async () => {
    mockHooks([createdConversation], { agentStarting: true });
    render(<App />);

    expect(
      await screen.findByText('エージェントサービスを起動しています...'),
    ).toBeInTheDocument();
  });
});
