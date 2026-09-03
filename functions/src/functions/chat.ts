import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/conversationService';
import { getModelConfig } from '../config/modelCatalog';
import {
  classifyUpstreamError,
  formatMessagesForApi,
  SafeErrorCode,
  streamChat,
} from '../services/opencodeGo';
import { OpenCodeGoMessage } from '../types';
import { getOptionalString, getRequiredString, readJsonBody } from './request';

const MOCK_RESPONSE = [
  'こんにちは！DoyonChatへようこそ。\n\n',
  '私はAIアシスタントです。',
  'テキストチャット、',
  '画像解析、',
  'コード生成など、',
  '様々なタスクをお手伝いできます。\n\n',
  '何かお話ししましょう！',
];

const INTERRUPTED_MESSAGE = '(生成が中断されました)';
const TRUNCATED_MARKER = '…(truncated)';
const REASONING_MAX_CODEPOINTS = 50_000;

function sseEvent(
  content: string,
  done: boolean,
  reasoning?: string,
): Uint8Array {
  const event: { content: string; reasoning?: string; done: boolean } = {
    content,
    done,
  };
  if (reasoning) event.reasoning = reasoning;

  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function sseErrorEvent(code: SafeErrorCode): Uint8Array {
  const event = { error: { code } };
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

async function* createResponseStream(
  history: OpenCodeGoMessage[],
  model: string,
  conversationId: string,
  userId: string,
): AsyncGenerator<Uint8Array> {
  let fullContent = '';
  let fullReasoning = '';
  let finalized = false;
  let savePartialOnStop = true;
  const upstreamAbortController = new AbortController();
  const startedAt = Date.now();
  let firstChunkAt: number | null = null;

  const emit = (
    content: string,
    done: boolean,
    reasoning?: string,
  ): Uint8Array => {
    if (firstChunkAt === null) {
      firstChunkAt = Date.now();
      console.info(`[functions/chat] TTFT=${firstChunkAt - startedAt}ms`);
    }
    return sseEvent(content, done, reasoning);
  };

  const reasoningCodepoints = (reasoning: string): number =>
    Array.from(reasoning).length;

  const truncateReasoning = (reasoning: string): string => {
    const codepoints = Array.from(reasoning);
    if (codepoints.length <= REASONING_MAX_CODEPOINTS) return reasoning;
    return codepoints.slice(0, REASONING_MAX_CODEPOINTS).join('') + TRUNCATED_MARKER;
  };

  const finalizeAssistant = async (content: string, reasoning?: string) => {
    if (finalized) return;
    finalized = true;
    const assistantMessage: Parameters<typeof service.addMessage>[0] = {
      conversationId,
      role: 'assistant',
      content,
    };
    if (reasoning) {
      assistantMessage.reasoning = truncateReasoning(reasoning);
    }
    await service.addMessage(assistantMessage, userId);
  };

  try {
    const apiKey = process.env.OPENCODE_GO_API_KEY || '';
    const useMock =
      !apiKey ||
      apiKey === 'sk-opencode-test-key' ||
      apiKey.startsWith('sk-test');

    if (useMock) {
      for (const chunk of MOCK_RESPONSE) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        fullContent += chunk;
        yield emit(chunk, false);
      }
    } else {
      for await (const chunk of streamChat(history, {
        model,
        signal: upstreamAbortController.signal,
        sessionId: conversationId,
      })) {
        if (chunk.done) break;
        fullContent += chunk.content;
        fullReasoning += chunk.reasoning || '';
        yield emit(chunk.content, false, chunk.reasoning);
      }
    }

    // 通常完了：既存どおり完全なアシスタントメッセージを保存してから完了イベントを送る。
    await finalizeAssistant(fullContent || '(No response)', fullReasoning || undefined);
    yield emit('', true);
    console.info(
      `[functions/chat] stream completed in ${Date.now() - startedAt}ms ` +
        `reasoning=${reasoningCodepoints(fullReasoning)}`,
    );
  } catch (error) {
    const classification = classifyUpstreamError(error);
    if (classification === 'interrupted') {
      // クライアント切断・ユーザー停止によるキャンセル：エラーにせず finally で中間保存する。
      console.info('[functions/chat] stream interrupted by client');
    } else {
      // 上流エラー：安全な error code だけを SSE イベントで送信し、本文として保存しない。
      savePartialOnStop = false;
      console.error(`[functions/chat] stream error: ${classification}`);
      try {
        yield sseErrorEvent(classification);
      } catch {
        // 接続が既に切れている場合は送信失敗を無視する
      }
    }
  } finally {
    upstreamAbortController.abort();
    if (!finalized && savePartialOnStop) {
      try {
        // 停止時の中間保存：本文・推論が空なら中断表示を使う
        const content = fullContent.trim() ? fullContent : INTERRUPTED_MESSAGE;
        const reasoning = fullReasoning || undefined;
        await finalizeAssistant(content, reasoning);
        const savedReasoningLength = reasoning
          ? reasoningCodepoints(truncateReasoning(reasoning))
          : 0;
        console.info(
          `[functions/chat] partial stream finalized ` +
            `(content=${fullContent.length}, reasoning=${savedReasoningLength})`,
        );
      } catch (error) {
        console.error('[functions/chat] partial assistant save failed');
      }
    }
  }
}

export async function chatHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const body = await readJsonBody(request);
    const conversationId = getRequiredString(body, 'conversationId');
    const message = getRequiredString(body, 'message');
    const imageBase64 = getOptionalString(body, 'imageBase64');
    const userMessageId = getOptionalString(body, 'userMessageId');

    const conversation = await service.getConversation(conversationId, userId);
    if (!conversation) throw new AppError(404, 'Conversation not found');
    const modelConfig = getModelConfig(conversation.model);
    if (!modelConfig) {
      throw new AppError(409, 'Selected model is no longer available');
    }
    if (modelConfig.protocol === 'messages' && imageBase64) {
      throw new AppError(400, 'Images are not supported by the selected model');
    }

    if (userMessageId) {
      // 再試行で同じ userMessageId が届いてもユーザーメッセージを重複保存しない。
      await service.addMessageIfAbsent(
        {
          id: userMessageId,
          conversationId,
          role: 'user',
          content: message,
          imageUrl: imageBase64 || undefined,
        },
        userId,
      );
    } else {
      await service.addMessage(
        {
          conversationId,
          role: 'user',
          content: message,
          imageUrl: imageBase64 || undefined,
        },
        userId,
      );
    }

    const messages = await service.listMessages(conversationId, userId);
    const history = formatMessagesForApi(messages);
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      history.push(
        imageBase64
          ? {
              role: 'user',
              content: [
                { type: 'text', text: message },
                { type: 'image_url', image_url: { url: imageBase64 } },
              ],
            }
          : { role: 'user', content: message },
      );
    }

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: createResponseStream(
        history,
        conversation.model,
        conversationId,
        userId,
      ),
    };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: chatHandler,
});
