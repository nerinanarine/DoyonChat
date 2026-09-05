import { HttpRequest } from '@azure/functions';
import { agentApproveHandler, agentRunHandler } from '../../src/functions/agent';
import * as service from '../../src/services/conversationService';
import { Conversation } from '../../src/types';

const CONVERSATION: Conversation = {
  id: 'conv-1',
  userId: 'dev-user',
  title: 'Agent',
  model: 'kimi-k2.6',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const RUN_RECORD = {
  id: 'run-1',
  status: 'running',
  conversationId: 'conv-1',
  approvals: [],
  createdAt: 1,
  updatedAt: 2,
};

function request(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): HttpRequest {
  return new HttpRequest({
    method,
    url: `http://localhost${path}`,
    params,
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
}

describe('Functions agent proxy handlers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AUTH_ENABLED = 'false';
    delete process.env.AGENT_GATEWAY_URL;
    delete process.env.AGENT_GATEWAY_KEY;
    process.env.AGENT_ENABLED = 'true';
    // 所有 checking の基底：dev-user が conv-1 を所有している
    jest.spyOn(service, 'getConversation').mockResolvedValue(CONVERSATION);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function mockFetch(status: number, jsonBody: unknown) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => jsonBody,
    } as Response);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    return fetchMock;
  }

  function mockApproveFlow(status: number, jsonBody: unknown) {
    // 1) GET /runs/:id（所有検証用） 2) POST /approve
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => RUN_RECORD,
      } as Response)
      .mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => jsonBody,
      } as Response);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    return fetchMock;
  }

  it('forwards approve and includes the shared key header when configured', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    process.env.AGENT_GATEWAY_KEY = 'shared-secret';
    const fetchMock = mockApproveFlow(200, { ok: true, approvalId: 'appr-1', approved: true });

    const response = await agentApproveHandler(
      request('POST', '/api/agent/approve', {
        approvalId: 'appr-1',
        runId: 'run-1',
        approved: true,
      }),
      {} as never,
    );

    expect(response).toEqual({
      status: 200,
      jsonBody: { ok: true, approvalId: 'appr-1', approved: true },
    });
    // 所有検証後にのみ承認が転送される（approve 呼び出しは GET /runs の直後）
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://gateway:8787/runs/run-1',
      expect.objectContaining({ method: 'GET' }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://gateway:8787/approve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer shared-secret' }),
        body: JSON.stringify({ approvalId: 'appr-1', runId: 'run-1', approved: true }),
      }),
    );
  });

  it('forwards approve without an auth header when no key is configured', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    const fetchMock = mockApproveFlow(200, { ok: true, approvalId: 'appr-1', approved: false });

    await agentApproveHandler(
      request('POST', '/api/agent/approve', {
        approvalId: 'appr-1',
        runId: 'run-1',
        approved: false,
      }),
      {} as never,
    );

    const callHeaders = fetchMock.mock.calls[1][1] as { headers: Record<string, string> };
    expect(callHeaders.headers).not.toHaveProperty('Authorization');
  });

  it('defaults missing approved to rejection', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    const fetchMock = mockApproveFlow(200, { ok: true, approvalId: 'appr-1', approved: false });

    await agentApproveHandler(
      request('POST', '/api/agent/approve', { approvalId: 'appr-1', runId: 'run-1' }),
      {} as never,
    );

    expect(JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body)).toEqual({
      approvalId: 'appr-1',
      runId: 'run-1',
      approved: false,
    });
  });

  it('rejects missing approvalId and runId with 400', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    mockApproveFlow(200, { ok: true });

    const missingApproval = await agentApproveHandler(
      request('POST', '/api/agent/approve', { runId: 'run-1' }),
      {} as never,
    );
    expect(missingApproval.status).toBe(400);

    const missingRun = await agentApproveHandler(
      request('POST', '/api/agent/approve', { approvalId: 'appr-1' }),
      {} as never,
    );
    expect(missingRun.status).toBe(400);
  });

  it('forwards run lookup and relays the gateway record', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    const record = {
      ...RUN_RECORD,
      status: 'settled',
      finalText: 'done',
      events: [{ type: 'agent_settled' }],
    };
    const fetchMock = mockFetch(200, record);

    const response = await agentRunHandler(
      request('GET', '/api/agent/runs/run-1', undefined, { runId: 'run-1' }),
      {} as never,
    );

    expect(response).toEqual({ status: 200, jsonBody: record });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway:8787/runs/run-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(service.getConversation).toHaveBeenCalledWith('conv-1', 'dev-user');
  });

  it('rejects a missing run id with 400', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    mockFetch(200, {});
    const response = await agentRunHandler(
      request('GET', '/api/agent/runs/', undefined, {}),
      {} as never,
    );
    expect(response.status).toBe(400);
  });

  it('maps gateway 404 to a safe 404 and 429 to rate limit', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    mockFetch(404, {});
    const notFound = await agentRunHandler(
      request('GET', '/api/agent/runs/nope', undefined, { runId: 'nope' }),
      {} as never,
    );
    expect(notFound.status).toBe(404);
    expect((notFound.jsonBody as { error: string }).error).not.toContain('gateway');

    mockApproveFlow(429, {});
    const busy = await agentApproveHandler(
      request('POST', '/api/agent/approve', {
        approvalId: 'appr-1',
        runId: 'run-1',
        approved: true,
      }),
      {} as never,
    );
    expect(busy.status).toBe(429);
    expect((busy.jsonBody as { error: string }).error).toBe('Agent service is busy');
  });

  it('returns 503 when the gateway is unreachable or not configured', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const unreachable = await agentApproveHandler(
      request('POST', '/api/agent/approve', {
        approvalId: 'appr-1',
        runId: 'run-1',
        approved: true,
      }),
      {} as never,
    );
    expect(unreachable.status).toBe(503);
    expect((unreachable.jsonBody as { error: string }).error).toBe('Agent service unavailable');

    delete process.env.AGENT_GATEWAY_URL;
    const notConfigured = await agentApproveHandler(
      request('POST', '/api/agent/approve', {
        approvalId: 'appr-1',
        runId: 'run-1',
        approved: true,
      }),
      {} as never,
    );
    expect(notConfigured.status).toBe(503);
    expect((notConfigured.jsonBody as { error: string }).error).toBe(
      'Agent service is not configured',
    );
  });

  it.each(['approve', 'run'])('disables %s endpoint when AGENT_ENABLED=false', async (kind) => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    process.env.AGENT_ENABLED = 'false';
    mockFetch(200, {});

    const response =
      kind === 'approve'
        ? await agentApproveHandler(
            request('POST', '/api/agent/approve', {
              approvalId: 'appr-1',
              runId: 'run-1',
              approved: true,
            }),
            {} as never,
          )
        : await agentRunHandler(
            request('GET', '/api/agent/runs/run-1', undefined, { runId: 'run-1' }),
            {} as never,
          );

    expect(response.status).toBe(404);
    expect((response.jsonBody as { error: string }).error).toBe(
      'Agent feature is not available',
    );
  });

  describe('run ownership verification (RG-2 F1)', () => {
    it('rejects runs without a conversationId with 404', async () => {
      process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
      mockFetch(200, { ...RUN_RECORD, conversationId: undefined });

      const response = await agentRunHandler(
        request('GET', '/api/agent/runs/run-1', undefined, { runId: 'run-1' }),
        {} as never,
      );
      expect(response.status).toBe(404);
      expect(service.getConversation).not.toHaveBeenCalled();
    });

    it('rejects runs whose conversation does not exist or is not owned', async () => {
      process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
      (service.getConversation as jest.Mock).mockResolvedValue(null);
      mockFetch(200, RUN_RECORD);

      const runResponse = await agentRunHandler(
        request('GET', '/api/agent/runs/run-1', undefined, { runId: 'run-1' }),
        {} as never,
      );
      expect(runResponse.status).toBe(404);

      mockApproveFlow(200, { ok: true });
      const approveResponse = await agentApproveHandler(
        request('POST', '/api/agent/approve', {
          approvalId: 'appr-1',
          runId: 'run-1',
          approved: true,
        }),
        {} as never,
      );
      expect(approveResponse.status).toBe(404);
      expect((approveResponse.jsonBody as { error: string }).error).toBe('Agent run not found');
    });

    it('does not forward the approval when the run is not owned', async () => {
      process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
      (service.getConversation as jest.Mock).mockResolvedValue(null);
      const fetchMock = mockApproveFlow(200, { ok: true });

      const response = await agentApproveHandler(
        request('POST', '/api/agent/approve', {
          approvalId: 'appr-1',
          runId: 'run-1',
          approved: true,
        }),
        {} as never,
      );

      expect(response.status).toBe(404);
      // 所有検証の GET /runs のみで、POST /approve は送られない
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalledWith(
        'http://gateway:8787/approve',
        expect.anything(),
      );
    });
  });
});