import { Conversation, Message, ModelInfo, UserSettingsResponse } from '../types';
import { get, post, del, put, patch, getToken } from './api';
import { ChatStreamError, isSafeCode } from './errorMessages';
import { msalInstance } from '../auth/msalConfig';

const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';

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

export async function autoGenerateTitle(id: string, text: string): Promise<Conversation> {
  return post<Conversation>(`/conversations/${id}/title/auto`, { text });
}

export interface ChatStreamChunk {
  content?: string;
  reasoning?: string;
}

export interface ChatStreamOptions {
  /** 再試行で同一ユーザーメッセージの重複保存を防ぐクライアント発行ID */
  userMessageId?: string;
}

export function streamChat(
  conversationId: string,
  message: string,
  imageBase64?: string,
  onChunk: (chunk: ChatStreamChunk) => void = () => {},
  onDone: () => void = () => {},
  onError: (err: Error) => void = () => {},
  options: ChatStreamOptions = {},
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
        body: JSON.stringify({
          conversationId,
          message,
          imageBase64,
          userMessageId: options.userMessageId,
        }),
        signal: controller.signal,
      });

      // トークン付き 401 = セッション期限切れ → 既存のログアウト・再ログインフローへ
      if (response.status === 401 && authEnabled && token) {
        await msalInstance.logoutRedirect();
        return;
      }

      if (!response.ok) {
        const status = response.status;
        if (status === 429) throw new ChatStreamError('rate_limit');
        if (status === 408 || status === 504) throw new ChatStreamError('timeout');
        if (status >= 500) throw new ChatStreamError('server');
        throw new ChatStreamError('network');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new ChatStreamError('network', 'No response body');
      const decoder = new TextDecoder();
      let buffer = '';

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) return;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') return;

        let parsed: {
          content?: unknown;
          reasoning?: unknown;
          done?: unknown;
          error?: unknown;
        };
        try {
          parsed = JSON.parse(jsonStr) as {
            content?: unknown;
            reasoning?: unknown;
            done?: unknown;
            error?: unknown;
          };
        } catch {
          // 壊れたSSE dataは無視して読み続ける
          return;
        }

        // ストリーミング中にバックエンドが安全なerror codeを送信した場合
        if (parsed.error && typeof parsed.error === 'object') {
          const code = (parsed.error as { code?: unknown }).code;
          throw new ChatStreamError(isSafeCode(code) ? code : 'server');
        }
        if (parsed.done === true) {
          complete();
          return;
        }

        const content = typeof parsed.content === 'string' ? parsed.content : '';
        const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
        if (content || reasoning) onChunk({ content, reasoning });
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
