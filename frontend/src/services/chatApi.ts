import { Conversation, Message, ModelInfo } from '../types';
import { get, post, del, put } from './api';

export async function fetchModels(): Promise<ModelInfo[]> {
  return get<ModelInfo[]>('/models');
}

export async function fetchConversations(): Promise<Conversation[]> {
  return get<Conversation[]>('/conversations');
}

export async function createConversation(title?: string, model?: string): Promise<Conversation> {
  return post<Conversation>('/conversations', { title, model });
}

export async function fetchConversationWithMessages(id: string): Promise<{ conversation: Conversation; messages: Message[] }> {
  return get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`);
}

export async function deleteConversation(id: string): Promise<void> {
  await del(`/conversations/${id}`);
}

export async function updateConversationModel(id: string, model: string): Promise<Conversation> {
  return put<Conversation>(`/conversations/${id}/model`, { model });
}

export function streamChat(
  conversationId: string,
  message: string,
  imageBase64?: string,
  onChunk: (text: string) => void = () => {},
  onDone: () => void = () => {},
  onError: (err: Error) => void = () => {},
): AbortController {
  const controller = new AbortController();
  const API_URL = import.meta.env.VITE_API_URL || '/api';

  (async () => {
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.done) {
              onDone();
            } else if (parsed.content) {
              onChunk(parsed.content);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
      onDone();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError(err as Error);
      }
    }
  })();

  return controller;
}
