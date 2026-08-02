import { Message, OpenCodeGoMessage } from '../types';

const API_BASE = 'https://opencode.ai/zen/go/v1';

interface OpenCodeGoOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface StreamChunk {
  content: string;
  done: boolean;
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

export async function* streamChat(
  messages: OpenCodeGoMessage[],
  options: OpenCodeGoOptions = {},
): AsyncGenerator<StreamChunk> {
  const apiKey = await getApiKey();
  const model = options.model || process.env.OPENCODE_GO_MODEL || 'kimi-k2.6';

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
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const lines = buffer.split('\n').filter((line) => line.trim());
        for (const line of lines) {
          const chunk = parseSSELine(line);
          if (chunk) yield chunk;
        }
        yield { content: '', done: true };
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const chunk = parseSSELine(line);
        if (chunk) yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSELine(line: string): StreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]') return null;
  if (!trimmed.startsWith('data: ')) return null;

  try {
    const json = JSON.parse(trimmed.slice(6));
    const delta = json.choices?.[0]?.delta;
    const content = delta?.content || delta?.reasoning_content || delta?.reasoning || '';
    return { content, done: false };
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
