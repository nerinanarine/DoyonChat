import { HttpRequest } from '@azure/functions';
import { Conversation } from '../../src/types';

jest.mock('../../src/services/conversationService', () => ({
  getConversation: jest.fn(),
  deleteConversation: jest.fn(),
}));

jest.mock('../../src/services/agentGateway', () => ({
  deleteGatewaySession: jest.fn(),
  loadAgentGatewayConfig: () => ({
    baseUrl: process.env.AGENT_GATEWAY_URL || '',
    key: undefined,
    enabled: process.env.AGENT_ENABLED !== 'false',
  }),
}));

import { conversationHandler } from '../../src/functions/conversations';
import * as service from '../../src/services/conversationService';
import { deleteGatewaySession } from '../../src/services/agentGateway';

const serviceMock = service as jest.Mocked<typeof service>;
const deleteGatewaySessionMock = deleteGatewaySession as jest.MockedFunction<
  typeof deleteGatewaySession
>;

const conversation: Conversation = {
  id: 'conv-1',
  userId: 'dev-user',
  title: 'Delete me',
  model: 'kimi-k2.6',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

function deleteRequest(): HttpRequest {
  return new HttpRequest({
    method: 'DELETE',
    url: 'http://localhost/api/conversations/conv-1',
    params: { id: 'conv-1' },
  });
}

describe('conversation DELETE with gateway session cleanup (RG-2 F2)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.AUTH_ENABLED = 'false';
    delete process.env.AGENT_GATEWAY_URL;
    process.env.AGENT_ENABLED = 'true';
    serviceMock.getConversation.mockResolvedValue(conversation);
    serviceMock.deleteConversation.mockResolvedValue(true);
    deleteGatewaySessionMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('deletes the conversation and requests gateway session cleanup', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    const response = await conversationHandler(deleteRequest(), {} as never);

    expect(response.status).toBe(204);
    expect(serviceMock.deleteConversation).toHaveBeenCalledWith('conv-1', 'dev-user');
    expect(deleteGatewaySessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, baseUrl: 'http://gateway:8787' }),
      { userId: 'dev-user', conversationId: 'conv-1' },
    );
  });

  it('does not send the cleanup when the agent feature is disabled', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    process.env.AGENT_ENABLED = 'false';
    const response = await conversationHandler(deleteRequest(), {} as never);

    expect(response.status).toBe(204);
    expect(deleteGatewaySessionMock).not.toHaveBeenCalled();
  });

  it('does not send the cleanup when the gateway is not configured', async () => {
    delete process.env.AGENT_GATEWAY_URL;
    const response = await conversationHandler(deleteRequest(), {} as never);

    expect(response.status).toBe(204);
    expect(deleteGatewaySessionMock).not.toHaveBeenCalled();
  });

  it('keeps deletion successful when the gateway cleanup fails (fire-and-forget)', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    deleteGatewaySessionMock.mockRejectedValue(new Error('boom'));
    const response = await conversationHandler(deleteRequest(), {} as never);

    expect(response.status).toBe(204);
    // fire-and-forget のため await 後も catch 済み（unhandled rejection にならない）
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('returns 404 when the conversation is missing or not owned', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    serviceMock.getConversation.mockResolvedValue(null);
    const response = await conversationHandler(deleteRequest(), {} as never);

    expect(response.status).toBe(404);
    expect(deleteGatewaySessionMock).not.toHaveBeenCalled();
  });
});