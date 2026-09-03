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
  titleAutoHandler,
  titleHandler,
} from '../../src/functions/conversations';
import { messagesHandler } from '../../src/functions/messages';
import { chatHandler } from '../../src/functions/chat';
import { userSettingsHandler } from '../../src/functions/users';
import { AppError, toHttpResponse } from '../../src/middleware/errorHandler';
import * as auth from '../../src/middleware/auth';
import * as conversationService from '../../src/services/conversationService';
import * as opencodeGo from '../../src/services/opencodeGo';
import { DEFAULT_MODEL_ID, MODEL_CATALOG } from '../../src/config/modelCatalog';

jest.mock('../../src/db', () => {
  const unavailableContainer = {
    read: jest.fn().mockRejectedValue(new Error('CosmosDB unavailable')),
  };
  return {
    getConversationsContainer: jest.fn(() => unavailableContainer),
    getMessagesContainer: jest.fn(() => unavailableContainer),
    getUserSettingsContainer: jest.fn(() => unavailableContainer),
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
    expect(models.jsonBody).toHaveLength(27);
    expect((models.jsonBody as Array<{ id: string }>).map(({ id }) => id)).toEqual([
      'grok-4.6',
      'gpt-5.6-luna',
      'glm-5.3-flash',
      'glm-5.3',
      'glm-5.2',
      'glm-5.1',
      'kimi-k3',
      'kimi-k2.7-code',
      'kimi-k2.6',
      'longcat-2.0',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v4-flash-vision-exp',
      'mimo-v2.5',
      'mimo-v2.5-pro',
      'minimax-m3',
      'minimax-m2.7',
      'minimax-m2.5',
      'muse-spark-1.3-contributor',
      'muse-spark-1.2-contributor',
      'qwen3.8-max',
      'qwen3.8-flash',
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.6-plus',
      'hy4-preview',
      'hy3',
    ]);
  });

  it('requires authentication when enabled', async () => {
    process.env.AUTH_ENABLED = 'true';

    const modelsResponse = await modelsHandler(request('GET', '/api/models'), {} as never);
    const titleResponse = await titleHandler(
      request('PUT', '/api/conversations/conversation-id/title', { title: 'Renamed' }),
      {} as never,
    );
    const autoTitleResponse = await titleAutoHandler(
      request('POST', '/api/conversations/conversation-id/title/auto', { text: 'こんにちは' }),
      {} as never,
    );
    const settingsResponse = await userSettingsHandler(
      request('GET', '/api/users/me/settings'),
      {} as never,
    );

    expect(modelsResponse.status).toBe(401);
    expect(titleResponse.status).toBe(401);
    expect(autoTitleResponse.status).toBe(401);
    expect(settingsResponse.status).toBe(401);
    process.env.AUTH_ENABLED = 'false';
  });

  it('gets and patches user settings (dev-user)', async () => {
    const empty = await userSettingsHandler(
      request('GET', '/api/users/me/settings'),
      {} as never,
    );
    expect(empty.status).toBe(200);
    expect(empty.jsonBody).toEqual({ userId: 'dev-user', settings: {} });

    const patched = await userSettingsHandler(
      request('PATCH', '/api/users/me/settings', { defaultModel: 'glm-5.1' }),
      {} as never,
    );
    expect(patched.status).toBe(200);
    expect(patched.jsonBody).toEqual(
      expect.objectContaining({ userId: 'dev-user', settings: { defaultModel: 'glm-5.1' } }),
    );

    const fetched = await userSettingsHandler(
      request('GET', '/api/users/me/settings'),
      {} as never,
    );
    expect(fetched.jsonBody).toEqual(patched.jsonBody);

    const cleared = await userSettingsHandler(
      request('PATCH', '/api/users/me/settings', { defaultModel: null }),
      {} as never,
    );
    expect(cleared.jsonBody).toEqual(
      expect.objectContaining({ userId: 'dev-user', settings: {} }),
    );
  });

  it.each([
    ['a non-string model', 123],
    ['a blank string model', '   '],
    ['an unknown model', 'unknown-model'],
  ])('rejects %s when patching user settings', async (_case, model) => {
    const response = await userSettingsHandler(
      request('PATCH', '/api/users/me/settings', { defaultModel: model }),
      {} as never,
    );

    expect(response.status).toBe(400);
  });

  it('keeps settings isolated per user', async () => {
    const authenticate = jest.spyOn(auth, 'authenticateRequest');
    process.env.AUTH_ENABLED = 'true';

    try {
      authenticate
        .mockResolvedValueOnce('alice')
        .mockResolvedValueOnce('alice')
        .mockResolvedValueOnce('bob');
      await userSettingsHandler(
        request('PATCH', '/api/users/me/settings', { defaultModel: 'kimi-k2.6' }),
        {} as never,
      );

      const alice = await userSettingsHandler(
        request('GET', '/api/users/me/settings'),
        {} as never,
      );
      expect(alice.jsonBody).toEqual(
        expect.objectContaining({
          userId: 'alice',
          settings: { defaultModel: 'kimi-k2.6' },
        }),
      );

      const bob = await userSettingsHandler(
        request('GET', '/api/users/me/settings'),
        {} as never,
      );
      expect(bob.jsonBody).toEqual(
        expect.objectContaining({ userId: 'bob', settings: {} }),
      );
    } finally {
      process.env.AUTH_ENABLED = 'false';
      authenticate.mockRestore();
    }
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

  it('defaults omitted models and accepts every catalog model', async () => {
    const defaulted = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Default model' }),
      {} as never,
    );
    expect(defaulted.status).toBe(201);
    expect(defaulted.jsonBody).toEqual(
      expect.objectContaining({ model: DEFAULT_MODEL_ID }),
    );
    for (const { info } of MODEL_CATALOG) {
      const created = await conversationsHandler(
        request('POST', '/api/conversations', {
          title: `Create ${info.id}`,
          model: info.id,
        }),
        {} as never,
      );
      expect(created.status).toBe(201);
      expect(created.jsonBody).toEqual(expect.objectContaining({ model: info.id }));
      const id = (created.jsonBody as { id: string }).id;
      const updated = await modelHandler(
        request('PUT', `/api/conversations/${id}/model`, { model: info.id }),
        {} as never,
      );
      expect(updated.status).toBe(200);
      expect(updated.jsonBody).toEqual(expect.objectContaining({ model: info.id }));
    }
  });

  it.each([
    ['a non-string model', 123],
    ['an unknown model', 'unknown-model'],
  ])('rejects %s on create without saving', async (_case, model) => {
    const before = await conversationsHandler(
      request('GET', '/api/conversations'),
      {} as never,
    );

    const response = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Invalid', model }),
      {} as never,
    );

    const after = await conversationsHandler(
      request('GET', '/api/conversations'),
      {} as never,
    );
    expect(response.status).toBe(400);
    expect(after.jsonBody).toHaveLength((before.jsonBody as unknown[]).length);
  });

  it.each([
    ['a non-string model', 123],
    ['an unknown model', 'unknown-model'],
  ])('rejects %s on update without changing the saved model', async (_case, model) => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Valid model' }),
      {} as never,
    );
    const conversation = created.jsonBody as { id: string; model: string };

    const response = await modelHandler(
      request('PUT', `/api/conversations/${conversation.id}/model`, { model }),
      {} as never,
    );

    const detail = await conversationHandler(
      request('GET', `/api/conversations/${conversation.id}`),
      {} as never,
    );
    expect(response.status).toBe(400);
    expect(detail.jsonBody).toEqual(
      expect.objectContaining({
        conversation: expect.objectContaining({ model: conversation.model }),
      }),
    );
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

  it('auto-generates a conversation title from the request text', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Auto title' }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    // OPENCODE_GO_API_KEY is 'sk-test-key' → generateTitle uses its deterministic mock path.
    const response = await titleAutoHandler(
      request('POST', `/api/conversations/${id}/title/auto`, { text: '最初のメッセージです' }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(
      expect.objectContaining({ id, title: '最初のメッセージです'.slice(0, 20) }),
    );
  });

  it('sanitizes generated titles (first line, enclosing quotes, fallback)', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Sanitize target' }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    const generate = jest.spyOn(opencodeGo, 'generateTitle');
    try {
      generate.mockResolvedValueOnce('「タイトル」\n（補足行は使われない）');
      const quoted = await titleAutoHandler(
        request('POST', `/api/conversations/${id}/title/auto`, { text: 'こんにちは' }),
        {} as never,
      );
      expect(quoted.status).toBe(200);
      expect(quoted.jsonBody).toEqual(expect.objectContaining({ id, title: 'タイトル' }));

      generate.mockResolvedValueOnce('  \n   ');
      const empty = await titleAutoHandler(
        request('POST', `/api/conversations/${id}/title/auto`, { text: 'こんにちは' }),
        {} as never,
      );
      expect(empty.status).toBe(200);
      expect(empty.jsonBody).toEqual(
        expect.objectContaining({ id, title: 'こんにちは'.slice(0, 30) }),
      );
    } finally {
      generate.mockRestore();
    }
  });

  it('rejects missing or blank text for auto title generation', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Text required' }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    const missing = await titleAutoHandler(
      request('POST', `/api/conversations/${id}/title/auto`, {}),
      {} as never,
    );
    expect(missing.status).toBe(400);

    const blank = await titleAutoHandler(
      request('POST', `/api/conversations/${id}/title/auto`, { text: '   ' }),
      {} as never,
    );
    expect(blank.status).toBe(400);
  });

  it('returns 404 for an unknown conversation on auto title generation', async () => {
    const response = await titleAutoHandler(
      request('POST', '/api/conversations/missing-conversation/title/auto', {
        text: 'こんにちは',
      }),
      {} as never,
    );

    expect(response.status).toBe(404);
  });

  it('returns 503 without changing the title when generation fails', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', { title: 'Failure target' }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    const generate = jest.spyOn(opencodeGo, 'generateTitle');
    try {
      generate.mockRejectedValueOnce(new Error('upstream unavailable'));
      const response = await titleAutoHandler(
        request('POST', `/api/conversations/${id}/title/auto`, { text: 'こんにちは' }),
        {} as never,
      );

      expect(response.status).toBe(503);
      const detail = await conversationHandler(
        request('GET', `/api/conversations/${id}`),
        {} as never,
      );
      expect(detail.jsonBody).toEqual(
        expect.objectContaining({ conversation: expect.objectContaining({ title: 'Failure target' }) }),
      );
    } finally {
      generate.mockRestore();
    }
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

  it('rejects a new image for Messages models before saving the user message', async () => {
    const created = await conversationsHandler(
      request('POST', '/api/conversations', {
        title: 'Messages image',
        model: 'minimax-m3',
      }),
      {} as never,
    );
    const id = (created.jsonBody as { id: string }).id;

    const response = await chatHandler(
      request('POST', '/api/chat', {
        conversationId: id,
        message: 'Describe this',
        imageBase64: 'data:image/png;base64,image',
      }),
      {} as never,
    );

    expect(response.status).toBe(400);
    await expect(conversationService.listMessages(id, 'dev-user')).resolves.toEqual([]);
  });

  it('rejects unavailable saved models before saving messages', async () => {
    const conversation = await conversationService.createConversation(
      'Unavailable model',
      'retired-model',
      'dev-user',
    );

    const response = await chatHandler(
      request('POST', '/api/chat', {
        conversationId: conversation.id,
        message: 'Hello',
      }),
      {} as never,
    );

    expect(response).toEqual({
      status: 409,
      jsonBody: { error: 'Selected model is no longer available' },
    });
    await expect(
      conversationService.listMessages(conversation.id, 'dev-user'),
    ).resolves.toEqual([]);
    const detail = await conversationHandler(
      request('GET', `/api/conversations/${conversation.id}`),
      {} as never,
    );
    expect(detail.status).toBe(200);
    expect(detail.jsonBody).toEqual(
      expect.objectContaining({ conversation: expect.objectContaining({ model: 'retired-model' }) }),
    );
  });

  it('converts application errors to the existing JSON format', () => {
    expect(toHttpResponse(new AppError(404, 'Conversation not found'))).toEqual({
      status: 404,
      jsonBody: { error: 'Conversation not found' },
    });
  });
});
