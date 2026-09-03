import {
  DEFAULT_MODEL_ID,
  getModelConfig,
  OpenCodeGoProtocol,
} from '../config/modelCatalog';
import { Message, OpenCodeGoMessage } from '../types';
import {
  createReasoningMarkupParser,
  normalizeChatCompletionDelta,
  normalizeResponsesEvent,
  ReasoningMarkupParser,
  textFromValue,
} from './reasoningNormalizer';

const API_BASE = 'https://opencode.ai/zen/go/v1';

export const DEFAULT_TITLE_MODEL_ID = 'deepseek-v4-flash';

const TITLE_GENERATION_TIMEOUT_MS = 20_000;
const TITLE_MAX_TOKENS = 60;

type ProtocolEvent =
  | { kind: 'delta'; content: string; reasoning: string }
  | { kind: 'delta_then_completed'; content: string; reasoning: string }
  | { kind: 'completed' }
  | { kind: 'error'; message: string };

export type SafeErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'authentication'
  | 'server'
  | 'network';

/**
 * 上流エラーを安全なコードだけに正規化して伝える。APIキー、上流レスポンス本文、
 * スタックトレースをメッセージへ含めない。
 */
export class UpstreamError extends Error {
  constructor(
    public readonly code: SafeErrorCode,
    message = 'OpenCode Go stream error',
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export type UpstreamClassification = SafeErrorCode | 'interrupted';

function codeForStatus(status: number): SafeErrorCode {
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 401 || status === 403) return 'authentication';
  return 'server';
}

/**
 * 上流エラーを分類する。ユーザー停止や接続断によるキャンセル（AbortError 相当）は
 * 'interrupted' とし、chat.ts の中断保存フローへ委譲する。
 */
export function classifyUpstreamError(error: unknown): UpstreamClassification {
  if (error instanceof UpstreamError) return error.code;
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof Error && error.name === 'AbortError') return 'interrupted';
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.name === 'AbortError') return 'interrupted';
    return 'network';
  }
  if (error instanceof TypeError) return 'network';
  return 'server';
}

type ResponsesInputPart =
  | { type: 'input_text' | 'output_text'; text: string }
  | { type: 'input_image'; image_url: string };

interface MessagesInput {
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
}

export interface StreamChunk {
  content: string;
  reasoning?: string;
  done: boolean;
}

export interface OpenCodeGoOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** 会話ごとの安定ID。OpenCode Go の `x-opencode-session` ヘッダへ渡される。 */
  sessionId?: string;
}

function toResponsesInput(messages: OpenCodeGoMessage[]) {
  return messages.map((message) => {
    const contentType =
      message.role === 'assistant' ? 'output_text' : 'input_text';
    const content: ResponsesInputPart[] = [];

    if (typeof message.content === 'string') {
      content.push({ type: contentType, text: message.content });
    } else {
      for (const part of message.content) {
        if (part.type === 'text') {
          content.push({ type: contentType, text: part.text || '' });
        } else if (part.image_url?.url) {
          content.push({ type: 'input_image', image_url: part.image_url.url });
        }
      }
    }

    return { role: message.role, content };
  });
}

function toMessagesInput(messages: OpenCodeGoMessage[]): MessagesInput[] {
  return messages.flatMap((message) => {
    const textParts =
      typeof message.content === 'string'
        ? [message.content]
        : message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text || '');
    const content = textParts
      .filter((text) => text.length > 0)
      .map((text) => ({ type: 'text' as const, text }));
    return content.length > 0 ? [{ role: message.role, content }] : [];
  });
}

async function getApiKey(): Promise<string> {
  const key = process.env.OPENCODE_GO_API_KEY;
  if (!key) {
    throw new Error('OPENCODE_GO_API_KEY is not configured');
  }
  return key;
}

function getTemperature(
  model: string,
  requestedTemperature: number | undefined,
): number | undefined {
  if (model === 'kimi-k3') return undefined;
  if (requestedTemperature !== undefined) return requestedTemperature;
  if (model === 'kimi-k2.7-code') return 1;
  return 0.7;
}

function createStreamChunk(
  content = '',
  reasoning = '',
  done = false,
): StreamChunk | null {
  if (!done && !content && !reasoning) return null;
  if (reasoning) return { content, reasoning, done };
  return { content, done };
}

function chunkFromParts(parts: {
  content: string;
  reasoning: string;
}): StreamChunk | null {
  return createStreamChunk(parts.content, parts.reasoning);
}

function flushMarkupParser(parser: ReasoningMarkupParser): StreamChunk | null {
  return chunkFromParts(parser.flush());
}

function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const message = textFromValue(record.message);
    if (message) return message;
  }
  return textFromValue(value) || 'OpenCode Go stream error';
}

const DEFAULT_MAX_TOKENS = 4096;

function resolveMaxTokens(model: string, requestedMaxTokens?: number): number {
  if (requestedMaxTokens !== undefined) return requestedMaxTokens;
  const envOverride = process.env.OPENCODE_GO_MAX_TOKENS;
  const envValue = envOverride ? Number(envOverride) : NaN;
  if (!Number.isNaN(envValue) && envValue > 0) {
    return envValue;
  }
  const config = getModelConfig(model);
  return config?.maxTokens ?? DEFAULT_MAX_TOKENS;
}

function createRequest(
  protocol: OpenCodeGoProtocol,
  messages: OpenCodeGoMessage[],
  model: string,
  options: OpenCodeGoOptions,
  apiKey: string,
): { url: string; init: RequestInit } {
  const maxTokens = resolveMaxTokens(model, options.maxTokens);
  const signal = options.signal;
  const extraHeaders: Record<string, string> = options.sessionId
    ? { 'x-opencode-session': options.sessionId }
    : {};

  if (protocol === 'responses') {
    return {
      url: `${API_BASE}/responses`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          input: toResponsesInput(messages),
          stream: true,
          max_output_tokens: maxTokens,
        }),
        signal,
      },
    };
  }

  if (protocol === 'chat-completions') {
    return {
      url: `${API_BASE}/chat/completions`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: getTemperature(model, options.temperature),
          max_tokens: maxTokens,
        }),
        signal,
      },
    };
  }

  if (protocol === 'messages') {
    return {
      url: `${API_BASE}/messages`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages: toMessagesInput(messages),
          max_tokens: maxTokens,
          stream: true,
        }),
        signal,
      },
    };
  }

  throw new Error(`Unsupported OpenCode Go protocol: ${String(protocol)}`);
}

async function fetchProtocolStream(
  protocol: OpenCodeGoProtocol,
  messages: OpenCodeGoMessage[],
  model: string,
  options: OpenCodeGoOptions,
  apiKey: string,
): Promise<Response> {
  const request = createRequest(protocol, messages, model, options, apiKey);
  const response = await fetch(request.url, request.init);
  if (!response.ok) {
    // 上流レスポンス本文はログ・SSE・UIへ出さない（P2-003 安全なエラー契約）。
    throw new UpstreamError(
      codeForStatus(response.status),
      `OpenCode Go API error (${response.status})`,
    );
  }
  return response;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const apiKey = await getApiKey();
    const model = process.env.OPENCODE_GO_MODEL || DEFAULT_MODEL_ID;
    const config = getModelConfig(model);
    if (!config) return false;
    const request = createRequest(
      config.protocol,
      [{ role: 'user', content: 'ping' }],
      model,
      { maxTokens: 1 },
      apiKey,
    );
    const response = await fetch(request.url, request.init);
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}

// カタログ外の TITLE モデル設定を検知するための既定モデル解決。
function resolveTitleModel(): string {
  const configured = process.env.OPENCODE_GO_TITLE_MODEL || DEFAULT_TITLE_MODEL_ID;
  if (!getModelConfig(configured)) {
    console.warn(
      `[opencodeGo] OPENCODE_GO_TITLE_MODEL "${configured}" is not in the model catalog; using "${DEFAULT_TITLE_MODEL_ID}"`,
    );
    return DEFAULT_TITLE_MODEL_ID;
  }
  return configured;
}

function isDevTestKey(apiKey: string): boolean {
  return apiKey === 'sk-opencode-test-key' || apiKey.startsWith('sk-test');
}

// 囲み引用符（" ' 「」 『』 “”）を一組だけ除去する。
function stripEnclosingQuotes(text: string): string {
  const pairs: Array<readonly [string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['「', '」'],
    ['『', '』'],
    ['\u201C', '\u201D'],
  ];
  for (const [open, close] of pairs) {
    if (text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(open.length, -close.length);
    }
  }
  return text;
}

// 生成タイトルを既存 titleHandler と同じコードポイント基準で整形する。
export function sanitizeGeneratedTitle(raw: string, fallback: string): string {
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return fallback;

  const cleaned = stripEnclosingQuotes(firstLine).trim();
  if (!cleaned) return fallback;

  const codepoints = Array.from(cleaned);
  return codepoints.length > 100 ? codepoints.slice(0, 100).join('') : cleaned;
}

// 会話タイトルを OpenCode Go に短命で生成させる（チャット本体ストリームとは独立）。
export async function generateTitle(
  text: string,
  signal?: AbortSignal,
  sessionId?: string,
): Promise<string> {
  const model = resolveTitleModel();
  const apiKey = await getApiKey().catch(() => '');
  if (!apiKey || isDevTestKey(apiKey)) {
    return Array.from(text).slice(0, 20).join('');
  }

  const prompt = [
    '次のメッセージから30文字以内の日本語タイトルのみを出力してください。',
    '引用符や記号は付けず、タイトルのみを1行で出力してください。',
    '',
    'メッセージ:',
    text,
  ].join('\n');

  const requestSignal = signal ?? AbortSignal.timeout(TITLE_GENERATION_TIMEOUT_MS);
  let content = '';
  for await (const chunk of streamChat(
    [{ role: 'user', content: prompt }],
    { model, maxTokens: TITLE_MAX_TOKENS, signal: requestSignal, sessionId },
  )) {
    if (chunk.done) break;
    content += chunk.content;
  }
  return content;
}

export async function* streamChat(
  messages: OpenCodeGoMessage[],
  options: OpenCodeGoOptions = {},
): AsyncGenerator<StreamChunk> {
  const apiKey = await getApiKey();
  const model = options.model || process.env.OPENCODE_GO_MODEL || DEFAULT_MODEL_ID;
  const config = getModelConfig(model);
  if (!config) {
    throw new Error(`Unknown OpenCode Go model: ${model}`);
  }

  const response = await fetchProtocolStream(
    config.protocol,
    messages,
    model,
    options,
    apiKey,
  );
  yield* normalizeProtocolStream(response, config.protocol);
}

async function* normalizeProtocolStream(
  response: Response,
  protocol: OpenCodeGoProtocol,
): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  const markupParser = createReasoningMarkupParser();
  let buffer = '';
  let reachedEof = false;

  const parseLine = (line: string): ProtocolEvent | null => {
    if (protocol === 'responses') {
      return parseResponsesSSELine(line, markupParser);
    }
    if (protocol === 'chat-completions') {
      return parseChatCompletionsSSELine(line, markupParser);
    }
    if (protocol === 'messages') {
      return parseMessagesSSELine(line, markupParser);
    }
    throw new Error(`Unsupported OpenCode Go protocol: ${String(protocol)}`);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEof = true;
        buffer += decoder.decode();
        for (const line of buffer.split('\n')) {
          const event = parseLine(line);
          if (!event) continue;
          if (event.kind === 'error') throw new UpstreamError('server');
          if (event.kind === 'delta' || event.kind === 'delta_then_completed') {
            const chunk = createStreamChunk(event.content, event.reasoning);
            if (chunk) yield chunk;
          }
          if (event.kind === 'completed' || event.kind === 'delta_then_completed') {
            const flushed = flushMarkupParser(markupParser);
            if (flushed) yield flushed;
            yield { content: '', done: true };
            return;
          }
        }
        throw new UpstreamError('server', 'stream ended before completion marker');
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const event = parseLine(line);
        if (!event) continue;
        if (event.kind === 'error') throw new UpstreamError('server');
        if (event.kind === 'delta' || event.kind === 'delta_then_completed') {
          const chunk = createStreamChunk(event.content, event.reasoning);
          if (chunk) yield chunk;
        }
        if (event.kind === 'completed' || event.kind === 'delta_then_completed') {
          const flushed = flushMarkupParser(markupParser);
          if (flushed) yield flushed;
          yield { content: '', done: true };
          return;
        }
      }
    }
  } finally {
    if (!reachedEof) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

function parseJsonData(line: string, protocol: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return null;
  const data = trimmed.slice(5).trimStart();
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('SSE data must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid ${protocol} SSE event`);
  }
}

function parseResponsesSSELine(
  line: string,
  markupParser: ReasoningMarkupParser,
): ProtocolEvent | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data:')) {
    return null;
  }
  const event = parseJsonData(line, 'Responses');
  if (!event) return null;
  if (event.type === 'error' || event.type === 'response.failed') {
    const error =
      event.error ||
      (event.response && (event.response as Record<string, unknown>).error) ||
      event.message;
    return { kind: 'error', message: errorMessage(error) };
  }

  // Responses の出力上限到達（incomplete）も正常完了として扱う。
  if (
    event.type === 'response.incomplete' ||
    (event.response &&
      typeof event.response === 'object' &&
      ((event.response as Record<string, unknown>).status === 'incomplete' ||
        (event.response as Record<string, unknown>).incomplete_reason ===
          'max_tokens'))
  ) {
    return { kind: 'completed' };
  }

  const normalized = normalizeResponsesEvent(event, markupParser);
  if (!normalized) return null;
  if (normalized.done) return { kind: 'completed' };
  return {
    kind: 'delta',
    content: normalized.content,
    reasoning: normalized.reasoning,
  };
}

function parseChatCompletionsSSELine(
  line: string,
  markupParser: ReasoningMarkupParser,
): ProtocolEvent | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return null;
  if (trimmed.slice(5).trim() === '[DONE]') return { kind: 'completed' };

  const json = parseJsonData(line, 'Chat Completions');
  if (!json) return null;
  if (json.error) return { kind: 'error', message: errorMessage(json.error) };

  const choices = Array.isArray(json.choices) ? json.choices : [];
  const firstChoice = choices[0];
  const choiceRecord =
    firstChoice && typeof firstChoice === 'object'
      ? (firstChoice as Record<string, unknown>)
      : undefined;

  const delta = choiceRecord?.delta;
  const parts = normalizeChatCompletionDelta(delta, markupParser);
  const isLengthStop = choiceRecord?.finish_reason === 'length';
  if (!parts.content && !parts.reasoning) {
    return isLengthStop ? { kind: 'completed' } : null;
  }
  return isLengthStop
    ? { kind: 'delta_then_completed', ...parts }
    : { kind: 'delta', ...parts };
}

function parseMessagesSSELine(
  line: string,
  markupParser: ReasoningMarkupParser,
): ProtocolEvent | null {
  const event = parseJsonData(line, 'Messages');
  if (!event) return null;
  if (event.type === 'error') {
    return { kind: 'error', message: errorMessage(event.error || event.message) };
  }
  if (event.type === 'message_stop') return { kind: 'completed' };

  // Messages の出力上限到達（max_tokens）も正常完了として扱う。
  if (
    event.type === 'message_delta' &&
    typeof event.delta === 'object' &&
    event.delta !== null &&
    (event.delta as Record<string, unknown>).stop_reason === 'max_tokens'
  ) {
    return { kind: 'completed' };
  }

  if (event.type !== 'content_block_delta') return null;

  const delta =
    typeof event.delta === 'object' && event.delta !== null
      ? (event.delta as Record<string, unknown>)
      : {};
  if (delta.type === 'thinking_delta') {
    const reasoning = textFromValue(delta.thinking ?? delta.text);
    return reasoning ? { kind: 'delta', content: '', reasoning } : null;
  }
  if (delta.type === 'text_delta') {
    const parts = markupParser.push(textFromValue(delta.text));
    return parts.content || parts.reasoning
      ? { kind: 'delta', ...parts }
      : null;
  }
  return null;
}

export function formatMessagesForApi(messages: Message[]): OpenCodeGoMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.imageUrl
      ? [
          { type: 'text' as const, text: message.content },
          { type: 'image_url' as const, image_url: { url: message.imageUrl } },
        ]
      : message.content,
  }));
}
