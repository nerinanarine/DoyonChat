import { MODEL_CATALOG, OpenCodeGoProtocol } from '../../src/config/modelCatalog';
import { OpenCodeGoMessage } from '../../src/types';
import {
  formatMessagesForApi,
  healthCheck,
  OpenCodeGoOptions,
  streamChat,
} from '../../src/services/opencodeGo';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function streamingResponse(...events: string[]) {
  let index = 0;
  const reader = {
    read: jest.fn(async () => {
      if (index < events.length) {
        return {
          done: false,
          value: new TextEncoder().encode(events[index++]),
        };
      }
      return { done: true, value: undefined };
    }),
    cancel: jest.fn().mockResolvedValue(undefined),
    releaseLock: jest.fn(),
  };

  return { ok: true, body: { getReader: () => reader }, reader };
}

function completionEvent(protocol: OpenCodeGoProtocol): string {
  if (protocol === 'responses') return 'data: {"type":"response.completed"}\n\n';
  if (protocol === 'chat-completions') return 'data: [DONE]\n\n';
  return 'data: {"type":"message_stop"}\n\n';
}

function expectedUrl(protocol: OpenCodeGoProtocol): string {
  if (protocol === 'responses') return 'https://opencode.ai/zen/go/v1/responses';
  if (protocol === 'chat-completions') {
    return 'https://opencode.ai/zen/go/v1/chat/completions';
  }
  return 'https://opencode.ai/zen/go/v1/messages';
}

async function collectStream(
  model: string,
  messages: OpenCodeGoMessage[] = [{ role: 'user', content: 'ping' }],
  options: Omit<OpenCodeGoOptions, 'model'> = {},
) {
  const chunks = [];
  for await (const chunk of streamChat(messages, { ...options, model })) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('Functions OpenCode Go API Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENCODE_GO_API_KEY: 'test-key' };
    mockFetch.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it.each(MODEL_CATALOG)('routes $info.id through $protocol', async ({ info, protocol }) => {
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent(protocol)));

    await expect(collectStream(info.id)).resolves.toEqual([{ content: '', done: true }]);

    expect(mockFetch).toHaveBeenCalledWith(
      expectedUrl(protocol),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses Responses request shape and separates reasoning from content', async () => {
    const response = streamingResponse(
      'data: {"type":"response.reasoning_summary_text.delta","delta":"考察"}\n\n' +
        'data: {"type":"response.output_text.delta","delta":"回答"}\n\n' +
        'data: {"type":"response.completed"}\n\n',
    );
    mockFetch.mockResolvedValueOnce(response);

    const chunks = await collectStream('grok-4.5');

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      model: 'grok-4.5',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'ping' }] },
      ],
      stream: true,
      max_output_tokens: 4096,
    });
    expect(chunks).toEqual([
      { content: '', reasoning: '考察', done: false },
      { content: '回答', done: false },
      { content: '', done: true },
    ]);
    expect(response.reader.cancel).toHaveBeenCalledTimes(1);
    expect(response.reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('uses Chat Completions request shape and separates reasoning from content', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"choices":[{"delta":{"reasoning_content":"考察"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"回答"}}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );

    const chunks = await collectStream('kimi-k2.6');

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      model: 'kimi-k2.6',
      messages: [{ role: 'user', content: 'ping' }],
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    });
    expect(chunks).toEqual([
      { content: '', reasoning: '考察', done: false },
      { content: '回答', done: false },
      { content: '', done: true },
    ]);
  });

  it('omits unsupported temperature for Kimi K3', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse('data: [DONE]\n\n'),
    );

    await collectStream('kimi-k3', undefined, { temperature: 0.7 });

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).not.toHaveProperty('temperature');
  });

  it('uses Messages headers/body, strips images, and normalizes text and thinking', async () => {
    const signal = new AbortController().signal;
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'event: content_block_delta\n' +
          'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"考察"}}\n\n' +
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"回答"}}\n\n' +
          'event: message_stop\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );
    const messages: OpenCodeGoMessage[] = [
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,image' } }],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'past answer' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,image' } },
        ],
      },
      { role: 'user', content: 'ping' },
    ];

    const chunks = await collectStream('minimax-m3', messages, { signal, maxTokens: 32 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        },
        signal,
      }),
    );
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      model: 'minimax-m3',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'past answer' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'ping' }] },
      ],
      max_tokens: 32,
      stream: true,
    });
    expect(chunks).toEqual([
      { content: '', reasoning: '考察', done: false },
      { content: '回答', done: false },
      { content: '', done: true },
    ]);
  });

  it.each([
    ['grok-4.5', 'responses' as const],
    ['kimi-k2.6', 'chat-completions' as const],
    ['minimax-m3', 'messages' as const],
  ])('passes AbortSignal to %s fetch', async (model, protocol) => {
    const signal = new AbortController().signal;
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent(protocol)));

    await collectStream(model, undefined, { signal });

    expect(mockFetch.mock.calls[0][1].signal).toBe(signal);
  });

  it.each([
    ['grok-4.5', 'data: {"type":"response.output_text.delta","delta":"partial"}\n\n'],
    ['kimi-k2.6', 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'],
    ['minimax-m3', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n'],
  ])('rejects %s when EOF arrives before its completion marker', async (model, event) => {
    mockFetch.mockResolvedValueOnce(streamingResponse(event));

    await expect(collectStream(model)).rejects.toThrow(
      'stream ended before completion marker',
    );
  });

  it.each([
    ['grok-4.5', 'data: {"type":"response.failed","error":{"message":"unavailable"}}\n\n'],
    ['kimi-k2.6', 'data: {"error":{"message":"unavailable"}}\n\n'],
    ['minimax-m3', 'data: {"type":"error","error":{"message":"unavailable"}}\n\n'],
  ])('surfaces %s protocol error events', async (model, event) => {
    mockFetch.mockResolvedValueOnce(streamingResponse(event));

    await expect(collectStream(model)).rejects.toThrow('unavailable');
  });

  it('rejects malformed mandatory SSE data', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponse('data: {invalid}\n\n'));

    await expect(collectStream('kimi-k2.6')).rejects.toThrow(
      'Invalid Chat Completions SSE event',
    );
  });

  it('rejects unknown models without an upstream request', async () => {
    await expect(collectStream('unknown-model')).rejects.toThrow(
      'Unknown OpenCode Go model',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('rate limited'),
    });

    await expect(collectStream('kimi-k2.6')).rejects.toThrow(
      'OpenCode Go API error (429)',
    );
  });

  it('uses the catalog protocol for health checks', async () => {
    process.env.OPENCODE_GO_MODEL = 'minimax-m3';
    const cancel = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce({ ok: true, body: { cancel } });

    await expect(healthCheck()).resolves.toBe(true);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not include saved reasoning in API history', () => {
    expect(
      formatMessagesForApi([
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: '回答',
          reasoning: '考察',
          createdAt: '2026-08-13T00:00:00.000Z',
        },
      ]),
    ).toEqual([{ role: 'assistant', content: '回答' }]);
  });
});
