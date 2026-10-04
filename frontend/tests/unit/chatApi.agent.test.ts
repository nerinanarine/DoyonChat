import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchAgentModels, respondAgentApproval, streamChat } from '../../src/services/chatApi';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function streamingResponse(...chunks: string[]) {
  let index = 0;
  const reader = {
    read: vi.fn(async () => {
      if (index < chunks.length) {
        return { done: false, value: new TextEncoder().encode(chunks[index++]) };
      }
      return { done: true, value: undefined };
    }),
  };
  return { ok: true, body: { getReader: () => reader } };
}

describe('gateway readiness relay (P2-018)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('polls the agent /models relay with GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ models: [] }),
    });

    await expect(fetchAgentModels()).resolves.toEqual({ models: [] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent/models'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('surfaces a 503 as an ApiError so callers can keep polling', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('{"error":"Agent service unavailable"}'),
    });

    await expect(fetchAgentModels()).rejects.toMatchObject({ status: 503 });
  });
});

describe('chat stream agent events', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('normalizes pi passthrough events and relays them via onAgentEvent', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"type":"agent_start"}\n\n' +
          'data: {"type":"tool_execution_start","toolCallId":"call-1","toolName":"read","args":{"path":"a.ts"}}\n\n' +
          'data: {"type":"tool_execution_end","toolCallId":"call-1","toolName":"read","isError":false}\n\n' +
          'data: {"type":"agent_settled"}\n\n' +
          'data: {"content":"","done":true,"runId":"run-1","finalText":"done"}\n\n',
      ),
    );

    const events: string[] = [];
    const done = new Promise<void>((resolve) => {
      streamChat(
        'conversation-1',
        '質問',
        undefined,
        resolve,
        undefined,
        {
          onAgentEvent: (event) => events.push(event.kind),
        },
      );
    });

    await done;
    expect(events).toEqual(['agent_start', 'tool_start', 'tool_end', 'agent_settled']);
  });

  it('surfaces subagent delegation info (agent/task) from tool_execution events', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"type":"tool_execution_start","toolCallId":"call-9","toolName":"subagent","args":{"agent":"researcher","task":"search the web for the latest pi version"}}\n\n' +
          'data: {"type":"tool_execution_update","toolCallId":"call-9","toolName":"subagent","args":{"agent":"researcher","task":"search the web for the latest pi version"}}\n\n' +
          'data: {"type":"tool_execution_end","toolCallId":"call-9","toolName":"subagent","isError":false}\n\n' +
          'data: {"content":"","done":true,"runId":"run-1","finalText":"ok"}\n\n',
      ),
    );

    const events: Array<Record<string, unknown>> = [];
    const done = new Promise<void>((resolve) => {
      streamChat('conversation-1', '質問', undefined, resolve, undefined, {
        onAgentEvent: (event) => events.push(event as Record<string, unknown>),
      });
    });

    await done;
    expect(events[0]).toMatchObject({
      kind: 'tool_start',
      toolName: 'subagent',
      agent: 'researcher',
      task: 'search the web for the latest pi version',
    });
    expect(events[1]).toMatchObject({ kind: 'tool_update', agent: 'researcher' });
    expect(events[2]).toMatchObject({ kind: 'tool_end', agent: 'researcher', isError: false });
  });

  it('relays approval requests and expired notifications via onApproval', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"approvalRequest":{"id":"appr-1","runId":"run-1","method":"confirm","title":"確認: read","message":"read a.ts"}}\n\n' +
          'data: {"approvalRequest":{"id":"appr-1","runId":"run-1","expired":true}}\n\n' +
          'data: {"content":"","done":true,"runId":"run-1","finalText":"x"}\n\n',
      ),
    );

    const approvals: Array<{ id: string; expired: boolean; title?: string }> = [];
    const done = new Promise<void>((resolve) => {
      streamChat(
        'conversation-1',
        '質問',
        undefined,
        resolve,
        undefined,
        {
          onApproval: (request) =>
            approvals.push({ id: request.id, expired: request.expired ?? false, title: request.title }),
        },
      );
    });

    await done;
    expect(approvals).toEqual([
      { id: 'appr-1', expired: false, title: '確認: read' },
      { id: 'appr-1', expired: true, title: undefined },
    ]);
  });

  it('ignores heartbeat comments and unknown fields while streaming normal chunks', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        ': ping\n\n' +
          'data: {"type":"some_future_event","payload":{}}\n\n' +
          'data: {"content":"回答","reasoning":"思考","done":false}\n\n' +
          'data: {"content":"","done":true}\n\n',
      ),
    );

    const chunks: Array<{ content?: string; reasoning?: string }> = [];
    const done = new Promise<void>((resolve) => {
      streamChat('conversation-1', '質問', (chunk) => chunks.push(chunk), resolve);
    });

    await done;
    expect(chunks).toEqual([{ content: '回答', reasoning: '思考' }]);
  });

  it('posts approve responses to the agent approve endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true }) });

    await respondAgentApproval({ approvalId: 'appr-1', runId: 'run-1', approved: true });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent/approve'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ approvalId: 'appr-1', runId: 'run-1', approved: true }),
      }),
    );
  });
});