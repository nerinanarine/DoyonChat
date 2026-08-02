import { HttpRequest } from '@azure/functions';
import { chatHandler } from '../../src/functions/chat';
import { conversationsHandler } from '../../src/functions/conversations';

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
