import {
  HttpRequest,
  HttpResponseInit,
} from '@azure/functions';
import { healthHandler } from '../../src/functions/health';
import { modelsHandler } from '../../src/functions/models';
import {
  conversationHandler,
  conversationsHandler,
  modelHandler,
} from '../../src/functions/conversations';
import { messagesHandler } from '../../src/functions/messages';
import { chatHandler } from '../../src/functions/chat';
import { AppError, toHttpResponse } from '../../src/middleware/errorHandler';

jest.mock('../../src/db', () => {
  const unavailableContainer = {
    read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
  };
  return {
    getConversationsContainer: jest.fn(() => unavailableContainer),
    getMessagesContainer: jest.fn(() => unavailableContainer),
  };
});

function request(
  method: string,
  path: string,
  body?: unknown,
): HttpRequest {
  return new HttpRequest({
    method,
    url: `http://localhost${path}`,
    params: path.includes('/conversations/')
      ? { id: path.split('/')[3] }
      : undefined,
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
}

async function readStream(response: HttpResponseInit): Promise<string> {
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

describe('Functions API contract', () => {
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

  it('serves health and models', async () => {
    const health = healthHandler(request('GET', '/api/health'), {} as never);
    expect(health.status).toBe(200);
    expect(health.jsonBody).toEqual(expect.objectContaining({ status: 'ok' }));

    const models = await modelsHandler(request('GET', '/api/models'), {} as never);
    expect(models.status).toBe(200);
    expect(Array.isArray(models.jsonBody)).toBe(true);
    expect(models.jsonBody).toHaveLength(18);
  });

  it('requires authentication when enabled', async () => {
    process.env.AUTH_ENABLED = 'true';

    const response = await modelsHandler(request('GET', '/api/models'), {} as never);

    expect(response.status).toBe(401);
    process.env.AUTH_ENABLED = 'false';
  });

  it('supports conversation CRUD and model updates', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', {
        title: 'Functions chat',
        model: 'kimi-k2.6',
        userId: 'spoofed-user',
      }),
      {} as never,
    );
    expect(created.status).toBe(201);
    expect(created.jsonBody).toEqual(expect.objectContaining({ userId: 'dev-user' }));

    const id = (created.jsonBody as { id: string }).id;
    const list = await conversationsHandler(request('GET', '/api/conversations'), {} as never);
    expect(list.status).toBe(200);
    expect((list.jsonBody as Array<{ id: string }>).some((item) => item.id === id)).toBe(true);

    const detail = await conversationHandler(
      request('GET', `/api/conversations/${id}`),
      {} as never,
    );
    expect(detail.status).toBe(200);
    expect(detail.jsonBody).toEqual(
      expect.objectContaining({ conversation: expect.objectContaining({ id }) }),
    );

    const updated = await modelHandler(
      request('PUT', `/api/conversations/${id}/model`, { model: 'glm-5.1' }),
      {} as never,
    );
    expect(updated.status).toBe(200);
    expect((updated.jsonBody as { model: string }).model).toBe('glm-5.1');

    const deleted = await conversationHandler(
      request('DELETE', `/api/conversations/${id}`),
      {} as never,
    );
    expect(deleted.status).toBe(204);
  });

  it('streams chat events and saves the assistant message', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'SSE chat' }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    const response = await chatHandler(
      request('POST', '/api/chat', { conversationId: id, message: 'Hello' }),
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
    );

    const text = await readStream(response);
    expect(text).toContain('"done":false');
    expect(text).toContain('"done":true');

    const messages = await messagesHandler(
      request('GET', `/api/conversations/${id}/messages`),
      {} as never,
    );
    expect(messages.status).toBe(200);
    expect(messages.jsonBody).toHaveLength(2);
  });

  it('converts application errors to the existing JSON format', () => {
    expect(toHttpResponse(new AppError(404, 'Conversation not found'))).toEqual({
      status: 404,
      jsonBody: { error: 'Conversation not found' },
    });
  });
});
