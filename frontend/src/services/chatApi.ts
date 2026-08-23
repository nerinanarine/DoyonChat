import { Conversation, Message, ModelInfo, UserSettingsResponse } from '../types';
import { get, post, del, put, patch, getToken } from './api';

export async function fetchModels(): Promise<ModelInfo[]> {
  return get<ModelInfo[]>('/models');
}

export async function fetchUserSettings(): Promise<UserSettingsResponse> {
  return get<UserSettingsResponse>('/users/me/settings');
}

export async function updateUserSettings(
  partial: { defaultModel?: string | null },
): Promise<UserSettingsResponse> {
  return patch<UserSettingsResponse>('/users/me/settings', partial);
}

export async function fetchConversations(): Promise<Conversation[]> {
  return get<Conversation[]>('/conversations');
}

export async function createConversation(title?: string, model?: string): Promise<Conversation> {
  return post<Conversation>('/conversations', { title, model });
}

export async function fetchConversationWithMessages(
  id: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  return get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`);
}

export async function deleteConversation(id: string): Promise<void> {
  await del(`/conversations/${id}`);
}

export async function updateConversationModel(id: string, model: string): Promise<Conversation> {
  return put<Conversation>(`/conversations/${id}/model`, { model });
}

export async function updateConversationTitle(id: string, title: string): Promise<Conversation> {
  return put<Conversation>(`/conversations/${id}/title`, { title: title.trim() });
}

export interface ChatStreamChunk {
  content?: string;
  reasoning?: string;
}

export function streamChat(
  conversationId: string,
  message: string,
  imageBase64?: string,
  onChunk: (chunk: ChatStreamChunk) => void = () => {},
  onDone: () => void = () => {},
  onError: (err: Error) => void = () => {},
): AbortController {
  const controller = new AbortController();
  const API_URL = import.meta.env.VITE_API_URL || '/api';

  (async () => {
    let completed = false;

    const complete = () => {
      if (completed) return;
      completed = true;
      onDone();
    };

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ conversationId, message, imageBase64 }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) return;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(jsonStr) as {
            content?: unknown;
            reasoning?: unknown;
            done?: unknown;
          };
          if (parsed.done === true) {
            complete();
            return;
          }

          const content = typeof parsed.content === 'string' ? parsed.content : '';
          const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
          if (content || reasoning) onChunk({ content, reasoning });
        } catch {
          // Ignore malformed SSE data and continue reading the stream.
        }
      };

      let reading = true;
      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          continue;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) handleLine(line);
      }

      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
      complete();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError(err as Error);
      }
    }
  })();

  return controller;
}
