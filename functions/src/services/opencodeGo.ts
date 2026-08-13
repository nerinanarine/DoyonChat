import { Message, OpenCodeGoMessage } from '../types';
import {
  createReasoningMarkupParser,
  normalizeChatCompletionDelta,
  normalizeResponsesEvent,
  ReasoningMarkupParser,
} from './reasoningNormalizer';

const API_BASE = 'https://opencode.ai/zen/go/v1';
// OpenCode Go exposes Grok 4.5 through the OpenAI Responses API.
const RESPONSES_API_MODELS = new Set(['grok-4.5']);

type ResponsesEvent =
  | { kind: 'delta'; content: string; reasoning: string }
  | { kind: 'completed' }
  | { kind: 'error'; message: string };

type ResponsesInputPart =
  | { type: 'input_text' | 'output_text'; text: string }
  | { type: 'input_image'; image_url: string };

export interface StreamChunk {
  content: string;
  reasoning?: string;
  done: boolean;
}

interface OpenCodeGoOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

function usesResponsesApi(model: string): boolean {
  return RESPONSES_API_MODELS.has(model);
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

async function getApiKey(): Promise<string> {
  const key = process.env.OPENCODE_GO_API_KEY;
  if (!key) {
    throw new Error('OPENCODE_GO_API_KEY is not configured');
  }
  return key;
}

function getDefaultTemperature(model: string): number {
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

export async function healthCheck(): Promise<boolean> {
  try {
    const apiKey = await getApiKey();
    const model = process.env.OPENCODE_GO_MODEL || 'kimi-k2.6';
    const useResponsesApi = usesResponsesApi(model);
    const response = await fetch(
      `${API_BASE}/${useResponsesApi ? 'responses' : 'chat/completions'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(
          useResponsesApi
            ? {
                model,
                input: toResponsesInput([{ role: 'user', content: 'ping' }]),
                max_output_tokens: 1,
              }
            : {
                model,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
              },
        ),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function* streamChat(
  messages: OpenCodeGoMessage[],
  options: OpenCodeGoOptions = {},
): AsyncGenerator<StreamChunk> {
  const apiKey = await getApiKey();
  const model = options.model || process.env.OPENCODE_GO_MODEL || 'kimi-k2.6';

  if (usesResponsesApi(model)) {
    yield* streamResponses(messages, model, options, apiKey);
    return;
  }

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options.temperature ?? getDefaultTemperature(model),
      max_tokens: options.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenCode Go API error (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  const markupParser = createReasoningMarkupParser();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        for (const line of buffer.split('\n').filter((item) => item.trim())) {
          const chunk = parseSSELine(line, markupParser);
          if (chunk) yield chunk;
        }
        const flushed = flushMarkupParser(markupParser);
        if (flushed) yield flushed;
        yield { content: '', done: true };
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const chunk = parseSSELine(line, markupParser);
        if (chunk) yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamResponses(
  messages: OpenCodeGoMessage[],
  model: string,
  options: OpenCodeGoOptions,
  apiKey: string,
): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${API_BASE}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: toResponsesInput(messages),
      stream: true,
      max_output_tokens: options.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenCode Go API error (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  const markupParser = createReasoningMarkupParser();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        for (const line of buffer.split('\n').filter((item) => item.trim())) {
          const event = parseResponsesSSELine(line, markupParser);
          if (!event) continue;
          if (event.kind === 'error') throw new Error(event.message);
          if (event.kind === 'delta') {
            const chunk = createStreamChunk(event.content, event.reasoning);
            if (chunk) yield chunk;
          }
          if (event.kind === 'completed') {
            const flushed = flushMarkupParser(markupParser);
            if (flushed) yield flushed;
            yield { content: '', done: true };
            return;
          }
        }
        const flushed = flushMarkupParser(markupParser);
        if (flushed) yield flushed;
        yield { content: '', done: true };
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const event = parseResponsesSSELine(line, markupParser);
        if (!event) continue;
        if (event.kind === 'error') throw new Error(event.message);
        if (event.kind === 'delta') {
          const chunk = createStreamChunk(event.content, event.reasoning);
          if (chunk) yield chunk;
        }
        if (event.kind === 'completed') {
          const flushed = flushMarkupParser(markupParser);
          if (flushed) yield flushed;
          yield { content: '', done: true };
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseResponsesSSELine(
  line: string,
  markupParser: ReasoningMarkupParser,
): ResponsesEvent | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) {
    return null;
  }

  try {
    const event = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
    if (event.type === 'error' || event.type === 'response.failed') {
      const error =
        event.error ||
        (event.response && (event.response as Record<string, unknown>).error) ||
        event.message;
      return {
        kind: 'error',
        message:
          typeof error === 'string'
            ? error
            : JSON.stringify(error || event.type),
      };
    }

    const normalized = normalizeResponsesEvent(event, markupParser);
    if (!normalized) return null;
    if (normalized.done) return { kind: 'completed' };
    return {
      kind: 'delta',
      content: normalized.content,
      reasoning: normalized.reasoning,
    };
  } catch {
    return null;
  }
}

function parseSSELine(
  line: string,
  markupParser: ReasoningMarkupParser,
): StreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) {
    return null;
  }

  try {
    const json = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
    const choices = Array.isArray(json.choices) ? json.choices : [];
    const firstChoice = choices[0];
    const delta =
      firstChoice && typeof firstChoice === 'object'
        ? (firstChoice as Record<string, unknown>).delta
        : undefined;
    return chunkFromParts(normalizeChatCompletionDelta(delta, markupParser));
  } catch {
    return null;
  }
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
