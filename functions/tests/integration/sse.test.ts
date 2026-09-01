import { HttpRequest } from '@azure/functions';
import { chatHandler } from '../../src/functions/chat';
import {
  conversationHandler,
  conversationsHandler,
} from '../../src/functions/conversations';
import * as conversationService from '../../src/services/conversationService';
import * as opencodeGo from '../../src/services/opencodeGo';
import { UpstreamError } from '../../src/services/opencodeGo';

jest.mock('../../src/db', () => {
  const unavailableContainer = {
    read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
  };
  return {
    getConversationsContainer: jest.fn(() => unavailableContainer),
    getMessagesContainer: jest.fn(() => unavailableContainer),
  };
});

function request(method: string, path: string, body?: unknown): HttpRequest {
  return new HttpRequest({
    method,
    url: `http://localhost${path}`,
    params: path.includes('/conversations/')
      ? { id: path.split('/')[3] }
      : undefined,
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
}

async function readStream(response: { body?: unknown }): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return new TextDecoder().decode(
    chunks.reduce((result, chunk) => {
      const merged = new Uint8Array(result.length + chunk.length);
      merged.set(result);
      merged.set(chunk, result.length);
      return merged;
    }, new Uint8Array()),
  );
}

describe('Functions SSE response', () => {
  const originalAuthEnabled = process.env.AUTH_ENABLED;
  const originalApiKey = process.env.OPENCODE_GO_API_KEY;

  beforeAll(() => {
    process.env.AUTH_ENABLED = 'false';
    process.env.COSMOSDB_REQUIRED = 'false';
    process.env.OPENCODE_GO_API_KEY = 'sk-test-key';
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuthEnabled;
    if (originalApiKey === undefined) delete process.env.OPENCODE_GO_API_KEY;
    else process.env.OPENCODE_GO_API_KEY = originalApiKey;
  });

  it('emits reasoning separately and persists it on the assistant message', async () => {
    process.env.OPENCODE_GO_API_KEY = 'real-test-key';
    const streamSpy = jest
      .spyOn(opencodeGo, 'streamChat')
      .mockImplementation(async function* () {
        yield { content: '', reasoning: '考察', done: false };
        yield { content: '回答', done: false };
        yield { content: '', done: true };
      });

    try {
      const created = await conversationsHandler(
        request('POST', '/api/conversations', { title: 'Reasoning chat' }),
        {} as never,
      );
      const conversationId = (created.jsonBody as { id: string }).id;

      const response = await chatHandler(
        request('POST', '/api/chat', { conversationId, message: 'Hello' }),
        {} as never,
      );
      const events: string[] = [];
      for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        events.push(new TextDecoder().decode(chunk));
      }

      const text = events.join('');
      expect(text).toContain('"reasoning":"考察"');
      expect(text).toContain('"content":"回答"');
      expect((text.match(/"done":true/g) || []).length).toBe(1);

      const detail = await conversationHandler(
        request('GET', `/api/conversations/${conversationId}`),
        {} as never,
      );
      expect(detail.jsonBody).toEqual(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: '回答',
              reasoning: '考察',
            }),
          ]),
        }),
      );
      expect(streamSpy).toHaveBeenCalledTimes(1);
    } finally {
      streamSpy.mockRestore();
      process.env.OPENCODE_GO_API_KEY = 'sk-test-key';
    }
  });

  it('emits ordered data events and a single completion event', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'SSE chat' }),
      {} as never,
    );
    const conversationId = (created.jsonBody as { id: string }).id;

    const response = await chatHandler(
      request('POST', '/api/chat', { conversationId, message: 'Hello' }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
    );

    const events: string[] = [];
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      events.push(new TextDecoder().decode(chunk));
    }

    const text = events.join('');
    expect(text).toContain('"done":false');
    expect(text).toContain('"done":true');
    expect((text.match(/"done":true/g) || []).length).toBe(1);
  });

  it('saves the partial assistant content when the stream is interrupted (client stop)', async () => {
    process.env.OPENCODE_GO_API_KEY = 'real-test-key';
    let upstreamSignal: AbortSignal | undefined;
    const streamSpy = jest
      .spyOn(opencodeGo, 'streamChat')
      .mockImplementation(async function* (_messages, options) {
        upstreamSignal = options?.signal;
        yield { content: 'partial answer', done: false };
        yield { content: ' should not be saved', done: false };
        yield { content: '', done: true };
      });

    try {
      const created = await conversationsHandler(
        request('POST', '/api/conversations', { title: 'Stop chat' }),
        {} as never,
      );
      const conversationId = (created.jsonBody as { id: string }).id;

      const response = await chatHandler(
        request('POST', '/api/chat', { conversationId, message: 'Hello' }),
        {} as never,
      );
      // クライアント切断をシミュレート：1チャンク受信後に generator を close する
      const iterator = (response.body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(new TextDecoder().decode(first.value as Uint8Array)).toContain('"content":"partial answer"');
      await (iterator as AsyncGenerator<Uint8Array>).return?.(undefined);
      expect(upstreamSignal?.aborted).toBe(true);

      const detail = await conversationHandler(
        request('GET', `/api/conversations/${conversationId}`),
        {} as never,
      );
      const messages = (detail.jsonBody as { messages: Array<{ content: string; role: string }> }).messages;
      expect(messages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Hello' }),
        expect.objectContaining({ role: 'assistant', content: 'partial answer' }),
      ]);
      expect(messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
      expect(streamSpy).toHaveBeenCalledTimes(1);
    } finally {
      streamSpy.mockRestore();
      process.env.OPENCODE_GO_API_KEY = 'sk-test-key';
    }
  });

  it('saves the interrupted marker when a stop arrives before any content', async () => {
    process.env.OPENCODE_GO_API_KEY = 'real-test-key';
    const streamSpy = jest
      .spyOn(opencodeGo, 'streamChat')
      .mockImplementation(async function* () {
        yield { content: '', reasoning: '', done: false };
        yield { content: '', done: true };
      });

    try {
      const created = await conversationsHandler(
        request('POST', '/api/conversations', { title: 'Empty stop' }),
        {} as never,
      );
      const conversationId = (created.jsonBody as { id: string }).id;

      const response = await chatHandler(
        request('POST', '/api/chat', { conversationId, message: 'Hello' }),
        {} as never,
      );
      const iterator = (response.body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
      await iterator.next();
      await (iterator as AsyncGenerator<Uint8Array>).return?.(undefined);

      const detail = await conversationHandler(
        request('GET', `/api/conversations/${conversationId}`),
        {} as never,
      );
      const messages = (detail.jsonBody as { messages: Array<{ content: string; reasoning?: string }> }).messages;
      expect(messages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Hello' }),
        expect.objectContaining({ role: 'assistant', content: '(生成が中断されました)' }),
      ]);
    } finally {
      streamSpy.mockRestore();
      process.env.OPENCODE_GO_API_KEY = 'sk-test-key';
    }
  });

  it('emits a safe error event and does not save an assistant message on upstream errors', async () => {
    process.env.OPENCODE_GO_API_KEY = 'real-test-key';
    const streamSpy = jest
      .spyOn(opencodeGo, 'streamChat')
      .mockImplementation(async function* () {
        yield { content: 'partial', done: false };
        throw new UpstreamError('rate_limit');
      });

    try {
      const created = await conversationsHandler(
        request('POST', '/api/conversations', { title: 'Error chat' }),
        {} as never,
      );
      const conversationId = (created.jsonBody as { id: string }).id;

      const response = await chatHandler(
        request('POST', '/api/chat', { conversationId, message: 'Hello' }),
        {} as never,
      );
      const text = await readStream(response);
      expect(text).toContain('{"error":{"code":"rate_limit"}}');
      expect(text).not.toContain('"done":true');
      expect(text).not.toContain('(エラーが発生しました)');

      const messages = await conversationService.listMessages(conversationId, 'dev-user');
      expect(messages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Hello' }),
      ]);
    } finally {
      streamSpy.mockRestore();
      process.env.OPENCODE_GO_API_KEY = 'sk-test-key';
    }
  });

  it('does not duplicate the user message when retrying with the same userMessageId', async () => {
    process.env.OPENCODE_GO_API_KEY = 'real-test-key';
    const streamSpy = jest
      .spyOn(opencodeGo, 'streamChat')
      .mockImplementationOnce(async function* () {
        yield { content: 'partial', done: false };
        throw new UpstreamError('server');
      })
      .mockImplementationOnce(async function* () {
        yield { content: 'OK', done: false };
        yield { content: '', done: true };
      });

    try {
      const created = await conversationsHandler(
        request('POST', '/api/conversations', { title: 'Retry chat' }),
        {} as never,
      );
      const conversationId = (created.jsonBody as { id: string }).id;
      const body = {
        conversationId,
        message: 'Retry me',
        userMessageId: 'client-message-id',
      };

      // 1回目：ストリーム中に上流エラー → アシスタント未保存
      const first = await chatHandler(request('POST', '/api/chat', body), {} as never);
      await readStream(first);
      // 2回目：同じ userMessageId で再試行 → ユーザーメッセージの重複保存なし
      const second = await chatHandler(request('POST', '/api/chat', body), {} as never);
      await readStream(second);

      const detail = await conversationHandler(
        request('GET', `/api/conversations/${conversationId}`),
        {} as never,
      );
      const messages = (detail.jsonBody as { messages: Array<{ id: string; role: string }> }).messages;
      expect(messages).toHaveLength(2);
      expect(messages.filter((message) => message.role === 'user')).toHaveLength(1);
      expect(messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
      expect(messages[0].id).toBe('client-message-id');
    } finally {
      streamSpy.mockRestore();
      process.env.OPENCODE_GO_API_KEY = 'sk-test-key';
    }
  });
});
