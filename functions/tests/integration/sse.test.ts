import { HttpRequest } from '@azure/functions';
import { chatHandler } from '../../src/functions/chat';
import {
  conversationHandler,
  conversationsHandler,
} from '../../src/functions/conversations';
import * as opencodeGo from '../../src/services/opencodeGo';

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
});
