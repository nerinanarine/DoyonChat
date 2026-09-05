import { HttpRequest } from '@azure/functions';

jest.mock('../../src/services/conversationService', () => ({
  updateConversationAgentMode: jest.fn(),
}));

import { agentModeHandler } from '../../src/functions/conversations';
import * as service from '../../src/services/conversationService';

const serviceMock = service as jest.Mocked<typeof service>;

function request(method: string, path: string, body?: unknown): HttpRequest {
  return new HttpRequest({
    method,
    url: `http://localhost${path}`,
    params: { id: 'conv-1' },
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
}

describe('Functions conversation agent-mode toggle', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.AUTH_ENABLED = 'false';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('enables agent mode for an owned conversation', async () => {
    const conversation = {
      id: 'conv-1',
      userId: 'alice',
      title: 'Agent',
      model: 'kimi-k2.6',
      agentMode: true,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    };
    serviceMock.updateConversationAgentMode.mockResolvedValue(conversation);

    const response = await agentModeHandler(
      request('PUT', '/api/conversations/conv-1/agent-mode', { enabled: true }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(serviceMock.updateConversationAgentMode).toHaveBeenCalledWith('conv-1', true, 'dev-user');
    expect(response.jsonBody).toEqual(conversation);
  });

  it('disables agent mode with false', async () => {
    serviceMock.updateConversationAgentMode.mockResolvedValue({
      id: 'conv-1',
      userId: 'alice',
      title: 'Agent',
      model: 'kimi-k2.6',
      agentMode: false,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    });

    const response = await agentModeHandler(
      request('PUT', '/api/conversations/conv-1/agent-mode', { enabled: false }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(serviceMock.updateConversationAgentMode).toHaveBeenCalledWith('conv-1', false, 'dev-user');
  });

  it('rejects a non-boolean enabled value with 400', async () => {
    const response = await agentModeHandler(
      request('PUT', '/api/conversations/conv-1/agent-mode', { enabled: 'yes' }),
      {} as never,
    );

    expect(response.status).toBe(400);
    expect(serviceMock.updateConversationAgentMode).not.toHaveBeenCalled();
  });

  it('returns 404 when the conversation is missing or not owned', async () => {
    serviceMock.updateConversationAgentMode.mockResolvedValue(null);

    const response = await agentModeHandler(
      request('PUT', '/api/conversations/conv-1/agent-mode', { enabled: true }),
      {} as never,
    );

    expect(response.status).toBe(404);
    expect((response.jsonBody as { error: string }).error).toBe('Conversation not found');
  });
});