import { describe, expect, it, vi, beforeEach } from 'vitest';
import { respondAgentApproval, streamChat, updateConversationAgentMode } from '../../src/services/chatApi';

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

describe('conversation agent mode API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('PUTs the enabled flag to the agent-mode endpoint', async () => {
    const updated = {
      id: 'conversation-1',
      title: '会話',
      model: 'model-1',
      agentMode: true,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(updated),
    });

    await expect(updateConversationAgentMode('conversation-1', true)).resolves.toEqual(updated);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conversation-1/agent-mode'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      }),
    );
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
      streamChat('conversation-1', '質問', undefined, (chunk) => chunks.push(chunk), resolve);
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