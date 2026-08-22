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
  titleHandler,
} from '../../src/functions/conversations';
import { messagesHandler } from '../../src/functions/messages';
import { chatHandler } from '../../src/functions/chat';
import { AppError, toHttpResponse } from '../../src/middleware/errorHandler';
import * as auth from '../../src/middleware/auth';
import * as conversationService from '../../src/services/conversationService';

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

    const modelsResponse = await modelsHandler(request('GET', '/api/models'), {} as never);
    const titleResponse = await titleHandler(
      request('PUT', '/api/conversations/conversation-id/title', { title: 'Renamed' }),
      {} as never,
    );

    expect(modelsResponse.status).toBe(401);
    expect(titleResponse.status).toBe(401);
    process.env.AUTH_ENABLED = 'false';
  });

  it('supports conversation CRUD, model updates, and title updates', async () => {
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

    const beforeRename = updated.jsonBody as Record<string, unknown>;
    const renamed = await titleHandler(
      request('PUT', `/api/conversations/${id}/title`, { title: '  Renamed chat  ' }),
      {} as never,
    );
    expect(renamed.status).toBe(200);
    expect(renamed.jsonBody).toEqual({ ...beforeRename, title: 'Renamed chat' });

    const detailAfterRename = await conversationHandler(
      request('GET', `/api/conversations/${id}`),
      {} as never,
    );
    expect(detailAfterRename.jsonBody).toEqual(
      expect.objectContaining({ conversation: renamed.jsonBody }),
    );

    const deleted = await conversationHandler(
      request('DELETE', `/api/conversations/${id}`),
      {} as never,
    );
    expect(deleted.status).toBe(204);
  });

  it.each([
    ['missing title', {}],
    ['non-string title', { title: 123 }],
    ['blank title', { title: '   ' }],
    ['title longer than 100 characters', { title: 'a'.repeat(101) }],
  ])('rejects %s', async (_case, body) => {
    const response = await titleHandler(
      request('PUT', '/api/conversations/conversation-id/title', body),
      {} as never,
    );

    expect(response.status).toBe(400);
  });

  it('accepts a 100-character title and returns 404 for an unknown conversation', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Boundary' }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    const boundary = await titleHandler(
      request('PUT', `/api/conversations/${id}/title`, { title: 'a'.repeat(100) }),
      {} as never,
    );
    expect(boundary.status).toBe(200);

    const missing = await titleHandler(
      request('PUT', '/api/conversations/missing/title', { title: 'Renamed' }),
      {} as never,
    );
    expect(missing.status).toBe(404);
  });

  it('counts an emoji as one character in the title limit', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Emoji boundary' }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    const boundary = await titleHandler(
      request('PUT', `/api/conversations/${id}/title`, { title: '😀'.repeat(100) }),
      {} as never,
    );

    expect(boundary.status).toBe(200);
  });

  it('returns 404 without changing a conversation owned by another user', async () => {
    const conversation = await conversationService.createConversation(
      'Bob conversation',
      'kimi-k2.6',
      'bob',
    );
    const authenticate = jest.spyOn(auth, 'authenticateRequest').mockResolvedValue('alice');
    process.env.AUTH_ENABLED = 'true';

    try {
      const response = await titleHandler(
        request('PUT', `/api/conversations/${conversation.id}/title`, { title: 'Stolen' }),
        {} as never,
      );

      expect(response.status).toBe(404);
      await expect(conversationService.getConversation(conversation.id, 'bob')).resolves.toEqual(
        conversation,
      );
    } finally {
      process.env.AUTH_ENABLED = 'false';
      authenticate.mockRestore();
    }
  });

  it('rejects malformed JSON for title updates', async () => {
    const malformed = new HttpRequest({
      method: 'PUT',
      url: 'http://localhost/api/conversations/conversation-id/title',
      params: { id: 'conversation-id' },
      body: { string: '{' },
    });

    const response = await titleHandler(malformed, {} as never);

    expect(response.status).toBe(400);
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
