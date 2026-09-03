import { MODEL_CATALOG, OpenCodeGoProtocol } from '../../src/config/modelCatalog';
import { OpenCodeGoMessage } from '../../src/types';
import {
  formatMessagesForApi,
  generateTitle,
  healthCheck,
  OpenCodeGoOptions,
  sanitizeGeneratedTitle,
  streamChat,
  DEFAULT_TITLE_MODEL_ID,
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

    const chunks = await collectStream('grok-4.6');

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      model: 'grok-4.6',
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
    ['grok-4.6', 'responses' as const],
    ['kimi-k2.6', 'chat-completions' as const],
    ['minimax-m3', 'messages' as const],
  ])('passes AbortSignal to %s fetch', async (model, protocol) => {
    const signal = new AbortController().signal;
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent(protocol)));

    await collectStream(model, undefined, { signal });

    expect(mockFetch.mock.calls[0][1].signal).toBe(signal);
  });

  it.each([
    ['grok-4.6', 'responses' as const],
    ['kimi-k2.6', 'chat-completions' as const],
    ['minimax-m3', 'messages' as const],
  ])('sends x-opencode-session header for %s when sessionId is provided', async (model, protocol) => {
    const sessionId = 'conversation-abc-123';
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent(protocol)));

    await collectStream(model, undefined, { sessionId });

    expect(mockFetch).toHaveBeenCalledWith(
      expectedUrl(protocol),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-opencode-session': sessionId,
        }),
      }),
    );
  });

  it.each([
    ['grok-4.6', 'responses' as const],
    ['kimi-k2.6', 'chat-completions' as const],
    ['minimax-m3', 'messages' as const],
  ])('omits x-opencode-session header for %s when sessionId is absent', async (model, protocol) => {
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent(protocol)));

    await collectStream(model, undefined, {});

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty('x-opencode-session');
  });

  it.each([
    ['grok-4.6', 'responses' as const],
    ['kimi-k2.6', 'chat-completions' as const],
    ['minimax-m3', 'messages' as const],
  ])('keeps x-opencode-session stable across two requests for %s', async (model, protocol) => {
    const sessionId = 'conversation-stable-001';
    mockFetch
      .mockResolvedValueOnce(streamingResponse(completionEvent(protocol)))
      .mockResolvedValueOnce(streamingResponse(completionEvent(protocol)));

    await collectStream(model, undefined, { sessionId });
    await collectStream(model, undefined, { sessionId });

    expect(mockFetch.mock.calls[0][1].headers['x-opencode-session']).toBe(sessionId);
    expect(mockFetch.mock.calls[1][1].headers['x-opencode-session']).toBe(sessionId);
  });

  it.each([
    ['grok-4.6', 'data: {"type":"response.output_text.delta","delta":"partial"}\n\n'],
    ['kimi-k2.6', 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'],
    ['minimax-m3', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n'],
  ])('rejects %s when EOF arrives before its completion marker', async (model, event) => {
    mockFetch.mockResolvedValueOnce(streamingResponse(event));

    await expect(collectStream(model)).rejects.toThrow(
      'stream ended before completion marker',
    );
  });

  it.each([
    ['grok-4.6', 'data: {"type":"response.failed","error":{"message":"unavailable"}}\n\n'],
    ['kimi-k2.6', 'data: {"error":{"message":"unavailable"}}\n\n'],
    ['minimax-m3', 'data: {"type":"error","error":{"message":"unavailable"}}\n\n'],
  ])('surfaces %s protocol errors as a safe server code', async (model, event) => {
    mockFetch.mockResolvedValueOnce(streamingResponse(event));

    await expect(collectStream(model)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'server',
    });
    // 上流の raw message はエラーオブジェクトへ漏れない
    await expect(collectStream(model)).rejects.not.toThrow('unavailable');
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

  it('surfaces HTTP errors as a safe rate_limit code without the upstream body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('rate limited secret body'),
    });

    await expect(collectStream('kimi-k2.6')).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'rate_limit',
    });
  });

  it.each([
    [429, 'rate_limit'],
    [408, 'timeout'],
    [504, 'timeout'],
    [401, 'authentication'],
    [403, 'authentication'],
    [500, 'server'],
    [503, 'server'],
  ])('classifies upstream HTTP status %i as %s', async (status, code) => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: jest.fn().mockResolvedValue('error body'),
    });

    await expect(collectStream('kimi-k2.6')).rejects.toMatchObject({ code });
  });

  it('classifies AbortError as interrupted and network TypeError as network', async () => {
    const { classifyUpstreamError } = require('../../src/services/opencodeGo');
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyUpstreamError(abort)).toBe('interrupted');
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    expect(classifyUpstreamError(timeout)).toBe('timeout');
    expect(classifyUpstreamError(new TypeError('fetch failed'))).toBe('network');
    expect(classifyUpstreamError(new Error('unknown'))).toBe('server');
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
    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty('x-opencode-session');
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

  it('uses model-specific max_tokens for DeepSeek V4 Flash', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponse('data: [DONE]\n\n'));

    await collectStream('deepseek-v4-flash');

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.max_tokens).toBe(16384);
  });

  it('overrides max_tokens via OPENCODE_GO_MAX_TOKENS', async () => {
    process.env.OPENCODE_GO_MAX_TOKENS = '2048';
    mockFetch.mockResolvedValueOnce(streamingResponse('data: [DONE]\n\n'));

    await collectStream('deepseek-v4-flash');

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.max_tokens).toBe(2048);
    delete process.env.OPENCODE_GO_MAX_TOKENS;
  });

  it('completes a 12k-character reasoning stream across multiple deltas', async () => {
    const reasoningPart = '考'.repeat(4000);
    const contentPart = '答'.repeat(100);
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        `data: {"choices":[{"delta":{"reasoning_content":"${reasoningPart}"}}]}\n\n` +
          `data: {"choices":[{"delta":{"reasoning_content":"${reasoningPart}"}}]}\n\n` +
          `data: {"choices":[{"delta":{"reasoning_content":"${reasoningPart}"}}]}\n\n` +
          `data: {"choices":[{"delta":{"content":"${contentPart}"}}]}\n\n` +
          'data: [DONE]\n\n',
      ),
    );

    const chunks = await collectStream('deepseek-v4-flash');

    const reasoningChunks = chunks.filter((c) => c.reasoning);
    const totalReasoning = reasoningChunks.reduce(
      (sum, c) => sum + (c.reasoning || ''),
      '',
    );
    expect(Array.from(totalReasoning).length).toBe(12000);
    expect(chunks[chunks.length - 1]).toEqual({ content: '', done: true });
  });

  it('treats finish_reason:length as a normal completion without [DONE]', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"choices":[{"delta":{"content":"partial answer"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"more"},"finish_reason":"length"}]}\n\n',
      ),
    );

    const chunks = await collectStream('deepseek-v4-flash');

    expect(chunks).toEqual([
      { content: 'partial answer', done: false },
      { content: 'more', done: false },
      { content: '', done: true },
    ]);
  });

  it('treats finish_reason:length on an empty delta as completed', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      ),
    );

    const chunks = await collectStream('deepseek-v4-flash');

    expect(chunks).toEqual([
      { content: 'answer', done: false },
      { content: '', done: true },
    ]);
  });

describe('generateTitle', () => {
  beforeEach(() => {
    delete process.env.OPENCODE_GO_TITLE_MODEL;
  });

  it('collects content chunks and ignores reasoning for the default title model', async () => {
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"choices":[{"delta":{"reasoning_content":"考察"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"タイトル"}}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );

    await expect(generateTitle('テストメッセージ')).resolves.toBe('タイトル');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      model: DEFAULT_TITLE_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: expect.stringContaining('30文字以内の日本語タイトル'),
        },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 60,
    });
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('uses OPENCODE_GO_TITLE_MODEL when configured', async () => {
    process.env.OPENCODE_GO_TITLE_MODEL = 'minimax-m3';
    mockFetch.mockResolvedValueOnce(
      streamingResponse(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"タイトル"}}\n\n' +
          'data: {"type":"message_stop"}\n\n',
      ),
    );

    await expect(generateTitle('テストメッセージ')).resolves.toBe('タイトル');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual(expect.objectContaining({ model: 'minimax-m3', max_tokens: 60 }));
  });

  it('falls back and warns when the configured title model is not in the catalog', async () => {
    process.env.OPENCODE_GO_TITLE_MODEL = 'unknown-model';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent('chat-completions')));

    await generateTitle('テストメッセージ');

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OPENCODE_GO_TITLE_MODEL "unknown-model"'),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/chat/completions',
      expect.anything(),
    );
    warn.mockRestore();
  });

  it('returns a deterministic mock title for test API keys without calling upstream', async () => {
    process.env.OPENCODE_GO_API_KEY = 'sk-test-key';

    await expect(generateTitle('あいうえおかきくけこ'.repeat(5))).resolves.toBe(
      'あいうえおかきくけこ'.repeat(5).slice(0, 20),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards an external AbortSignal to the upstream request', async () => {
    const signal = new AbortController().signal;
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent('chat-completions')));

    await generateTitle('テストメッセージ', signal);

    expect(mockFetch.mock.calls[0][1].signal).toBe(signal);
  });

  it('forwards sessionId to the upstream request for title generation', async () => {
    const sessionId = 'title-conversation-xyz';
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent('chat-completions')));

    await generateTitle('テストメッセージ', undefined, sessionId);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-opencode-session': sessionId,
        }),
      }),
    );
  });

  it('omits x-opencode-session header for title generation when sessionId is absent', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponse(completionEvent('chat-completions')));

    await generateTitle('テストメッセージ');

    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty('x-opencode-session');
  });
});

describe('sanitizeGeneratedTitle', () => {
  it('uses the first non-empty line only', () => {
    expect(
      sanitizeGeneratedTitle('\n  タイトル  \n補足は使わない', 'フォールバック'),
    ).toBe('タイトル');
  });

  it('strips one pair of enclosing quotes', () => {
    expect(sanitizeGeneratedTitle('「タイトル」', 'フォールバック')).toBe('タイトル');
    expect(sanitizeGeneratedTitle('"タイトル"', 'フォールバック')).toBe('タイトル');
    expect(sanitizeGeneratedTitle('『タイトル』', 'フォールバック')).toBe('タイトル');
    expect(sanitizeGeneratedTitle('\u201Cタイトル\u201D', 'フォールバック')).toBe('タイトル');
  });

  it('returns the fallback when every line is empty or stripped to nothing', () => {
    expect(sanitizeGeneratedTitle('\n  \n', 'フォールバック')).toBe('フォールバック');
    expect(sanitizeGeneratedTitle('""', 'フォールバック')).toBe('フォールバック');
  });

  it('truncates titles to 100 code points', () => {
    const long = 'あ'.repeat(101);
    expect(sanitizeGeneratedTitle(long, 'フォールバック')).toBe('あ'.repeat(100));
  });

  it('counts surrogate-pair emoji as one code point', () => {
    expect(sanitizeGeneratedTitle('😀'.repeat(101), 'フォールバック')).toBe('😀'.repeat(100));
  });
});
});
