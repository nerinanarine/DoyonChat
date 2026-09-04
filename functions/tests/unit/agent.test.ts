import { HttpRequest } from '@azure/functions';
import { agentApproveHandler, agentRunHandler } from '../../src/functions/agent';

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

  it('forwards approve and includes the shared key header when configured', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    process.env.AGENT_GATEWAY_KEY = 'shared-secret';
    const fetchMock = mockFetch(200, { ok: true, approvalId: 'appr-1', approved: true });

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
    expect(fetchMock).toHaveBeenCalledWith(
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
    const fetchMock = mockFetch(200, { ok: true, approvalId: 'appr-1', approved: false });

    await agentApproveHandler(
      request('POST', '/api/agent/approve', {
        approvalId: 'appr-1',
        runId: 'run-1',
        approved: false,
      }),
      {} as never,
    );

    const callHeaders = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(callHeaders.headers).not.toHaveProperty('Authorization');
  });

  it('defaults missing approved to rejection', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    const fetchMock = mockFetch(200, { ok: true, approvalId: 'appr-1', approved: false });

    await agentApproveHandler(
      request('POST', '/api/agent/approve', { approvalId: 'appr-1', runId: 'run-1' }),
      {} as never,
    );

    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      approvalId: 'appr-1',
      runId: 'run-1',
      approved: false,
    });
  });

  it('rejects missing approvalId and runId with 400', async () => {
    process.env.AGENT_GATEWAY_URL = 'http://gateway:8787';
    mockFetch(200, { ok: true });

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
      id: 'run-1',
      status: 'settled',
      finalText: 'done',
      approvals: [],
      events: [{ type: 'agent_settled' }],
      createdAt: 1,
      updatedAt: 2,
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

    mockFetch(429, {});
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
});