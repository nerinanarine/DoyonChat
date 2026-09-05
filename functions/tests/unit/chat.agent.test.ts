import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { AgentGatewayConfig } from '../../src/services/agentGateway';

jest.mock('../../src/services/conversationService', () => ({
  getConversation: jest.fn(),
  addMessage: jest.fn(),
  addMessageIfAbsent: jest.fn(),
  listMessages: jest.fn(),
}));
jest.mock('../../src/services/userSettingsService', () => ({
  getSettings: jest.fn(),
}));

import { chatHandler, createAgentResponseStream } from '../../src/functions/chat';
import * as service from '../../src/services/conversationService';
import * as settingsService from '../../src/services/userSettingsService';

const serviceMock = service as jest.Mocked<typeof service>;
const settingsMock = settingsService as jest.Mocked<typeof settingsService>;

function request(method: string, path: string, body?: unknown): HttpRequest {
  return new HttpRequest({
    method,
    url: `http://localhost${path}`,
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
}

function sseStream(...events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

function mockGatewayStream(...events: Record<string, unknown>[]) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: sseStream(...events),
  } as unknown as Response);
  jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
  return fetchMock;
}

async function* bodyAsGenerator(body: unknown): AsyncGenerator<Uint8Array> {
  const generator = body as AsyncGenerator<Uint8Array>;
  for await (const chunk of generator) yield chunk;
}

async function streamText(response: HttpResponseInit): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  if (!response.body) return text;
  for await (const chunk of bodyAsGenerator(response.body)) {
    text += decoder.decode(chunk);
  }
  return text;
}

const AGENT_CONVERSATION = {
  id: 'conv-1',
  userId: 'alice',
  title: 'Agent Chat',
  model: 'kimi-k2.6',
  agentMode: true,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

describe('Functions /chat agent branch', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.AUTH_ENABLED = 'false';
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    process.env.AGENT_ENABLED = 'true';
    serviceMock.getConversation.mockResolvedValue(AGENT_CONVERSATION);
    settingsMock.getSettings.mockResolvedValue({
      userId: 'alice',
      settings: {},
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('relays to the gateway and finalizes with accumulated content and reasoning', async () => {
    settingsMock.getSettings.mockResolvedValue({
      userId: 'alice',
      settings: {
        agentApprovalLevel: 'always',
        agentModel: 'opencode-go/grok-4.6',
        agentSubagentModel: 'opencode-go/deepseek-v4-flash',
      },
    });
    const fetchMock = mockGatewayStream(
      { content: 'hello ' },
      { reasoning: 'thinking…' },
      {
        approvalRequest: {
          id: 'appr-1',
          runId: 'run-1',
          method: 'confirm',
          title: 'ツール実行の確認: read',
        },
      },
      { type: 'tool_execution_start', toolName: 'read', toolCallId: 'call-1' },
      { content: 'world' },
      { done: true, runId: 'run-1', finalText: 'hello world' },
    );

    const response = await chatHandler(
      request('POST', '/api/chat', {
        conversationId: 'conv-1',
        message: 'hi',
        userMessageId: 'um-1',
      }),
      {} as never,
    );

    expect(response.status).toBe(200);

    // ストリームを消費してから gateway 呼び出し・保存を検証する（生成器は遅延実行）
    const text = await streamText(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway:8787/prompt',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          message: 'hi',
          userId: 'dev-user',
          conversationId: 'conv-1',
          approvalLevel: 'always',
          model: 'opencode-go/grok-4.6',
          subagentModel: 'opencode-go/deepseek-v4-flash',
        }),
      }),
    );

    expect(text).toContain('"content":"hello "');
    expect(text).toContain('"content":"world"');
    expect(text).toContain('"reasoning":"thinking…"');
    expect(text).toContain('"approvalRequest"');
    expect(text).toContain('"tool_execution_start"');
    expect(text).toContain('"done":true');
    // gateway の finalText はフロントに流しても参照されないが、契約上 done のみにする
    expect(text).not.toContain('finalText');

    // ユーザーメッセージは userMessageId で冪等保存
    expect(serviceMock.addMessageIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'um-1', conversationId: 'conv-1', role: 'user', content: 'hi' }),
      'dev-user',
    );

    // アシスタントは蓄積済みの本文と推論・実行モデルで保存
    const assistantCall = serviceMock.addMessage.mock.calls.find(
      ([message]) => message.role === 'assistant',
    );
    expect(assistantCall).toBeDefined();
    expect(assistantCall![0]).toEqual({
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'hello world',
      reasoning: 'thinking…',
      model: 'opencode-go/grok-4.6',
    });
    expect(assistantCall![1]).toBe('dev-user');
  });

  it('defaults approval level to dangerous-only when not configured', async () => {
    const fetchMock = mockGatewayStream({ done: true, runId: 'run-1', finalText: '' });

    const response = await chatHandler(
      request('POST', '/api/chat', { conversationId: 'conv-1', message: 'hi' }),
      {} as never,
    );
    await streamText(response);

    const payload = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      approvalLevel?: string;
    };
    expect(payload.approvalLevel).toBe('dangerous-only');
  });

  it('maps a gateway 429 to an SSE rate_limit error without saving the assistant', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      body: null,
    } as unknown as Response);

    const response = await chatHandler(
      request('POST', '/api/chat', { conversationId: 'conv-1', message: 'hi' }),
      {} as never,
    );

    const text = await streamText(response);
    expect(text).toContain('"error":{"code":"rate_limit"}');
    // ユーザーメッセージのみ保存され、アシスタントは保存されない
    expect(serviceMock.addMessage).toHaveBeenCalledTimes(1);
    expect(serviceMock.addMessage.mock.calls[0][0]).toEqual(
      expect.objectContaining({ role: 'user', content: 'hi' }),
    );
  });

  it('returns 404 when the agent feature is disabled (kill switch)', async () => {
    process.env.AGENT_ENABLED = 'false';

    const response = await chatHandler(
      request('POST', '/api/chat', { conversationId: 'conv-1', message: 'hi' }),
      {} as never,
    );

    expect(response.status).toBe(404);
    expect((response.jsonBody as { error: string }).error).toBe('Agent feature is not available');
    expect(serviceMock.addMessage).not.toHaveBeenCalled();
    expect(serviceMock.addMessageIfAbsent).not.toHaveBeenCalled();
  });

  it('rejects images in agent mode with 400', async () => {
    const response = await chatHandler(
      request('POST', '/api/chat', {
        conversationId: 'conv-1',
        message: 'hi',
        imageBase64: 'data:image/png;base64,AA==',
      }),
      {} as never,
    );

    expect(response.status).toBe(400);
    expect(serviceMock.addMessage).not.toHaveBeenCalled();
  });

  it('emits a safe server error and does not save on premature EOF', async () => {
    const fetchMock = mockGatewayStream({ content: 'partial only' });
    // 完了マーカーなしで閉じる → forwardPromptStream が server エラーで throw

    const response = await chatHandler(
      request('POST', '/api/chat', { conversationId: 'conv-1', message: 'hi' }),
      {} as never,
    );

    const text = await streamText(response);
    expect(text).toContain('"error":{"code":"server"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // ユーザーメッセージのみ保存。上流エラー時はアシスタント本文を保存しない（通常経路と同じ）。
    expect(serviceMock.addMessage).toHaveBeenCalledTimes(1);
    expect(serviceMock.addMessage.mock.calls[0][0]).toEqual(
      expect.objectContaining({ role: 'user', content: 'hi' }),
    );
  });

  it('keeps the normal chat path untouched for non-agent conversations', async () => {
    serviceMock.getConversation.mockResolvedValue({ ...AGENT_CONVERSATION, agentMode: false });
    serviceMock.listMessages.mockResolvedValue([]);
    // gateway に到達したら失敗するスパイを仕掛け、通常経路が fetch しないことを確認する
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => {
        throw new Error('gateway must not be reached');
      });

    const response = await chatHandler(
      request('POST', '/api/chat', { conversationId: 'conv-1', message: 'hi' }),
      {} as never,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const text = await streamText(response);
    expect(text).toContain('"done":true');
  });
});

describe('createAgentResponseStream partial save on stop', () => {
  const config: AgentGatewayConfig = {
    baseUrl: 'http://gateway:8787',
    audience: '',
    enabled: true,
  };
  const payload = {
    message: 'hi',
    userId: 'alice',
    conversationId: 'conv-1',
    approvalLevel: 'dangerous-only' as const,
    model: 'opencode-go/grok-4.6',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** 1件目のイベントを返した後、AbortError で読取を中断するストリーム。 */
  function abortingStream(first: Record<string, unknown>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let sent = false;
    return new ReadableStream({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(first)}\n\n`));
        } else {
          controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }
      },
    });
  }

  /** 最初の read から AbortError で中断されるストリーム。 */
  function immediateAbortStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      pull(controller) {
        controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      },
    });
  }

  async function collectAssistantCall() {
    return serviceMock.addMessage.mock.calls.find(
      ([message]) => message.role === 'assistant',
    );
  }

  it('saves the partial assistant text when the stream is interrupted', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: abortingStream({ content: 'hello ', reasoning: 'hmm' }),
    } as unknown as Response);

    const gen = createAgentResponseStream(config, payload, 'conv-1', 'alice');
    const first = await gen.next();
    const firstText = new TextDecoder().decode(first.value as Uint8Array);
    expect(firstText).toContain('"content":"hello "');

    // 2回目の read が AbortError で中断 → interrupted 扱い → 部分保存
    await gen.next();

    const assistantCall = await collectAssistantCall();
    expect(assistantCall).toBeDefined();
    expect(assistantCall![0]).toEqual({
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'hello ',
      reasoning: 'hmm',
      model: 'opencode-go/grok-4.6',
    });
  });

  it('saves the interrupted marker when nothing was accumulated', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: immediateAbortStream(),
    } as unknown as Response);

    const gen = createAgentResponseStream(config, payload, 'conv-1', 'alice');
    await gen.next();

    const assistantCall = await collectAssistantCall();
    expect(assistantCall![0]).toEqual({
      conversationId: 'conv-1',
      role: 'assistant',
      content: '(生成が中断されました)',
      model: 'opencode-go/grok-4.6',
    });
  });
});