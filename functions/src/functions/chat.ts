import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/conversationService';
import { formatMessagesForApi, streamChat } from '../services/opencodeGo';
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

function sseEvent(content: string, done: boolean): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify({ content, done })}\n\n`,
  );
}

async function* createResponseStream(
  history: OpenCodeGoMessage[],
  model: string,
  conversationId: string,
  userId: string,
): AsyncGenerator<Uint8Array> {
  let fullContent = '';
  const startedAt = Date.now();
  let firstChunkAt: number | null = null;

  const emit = (content: string, done: boolean): Uint8Array => {
    if (firstChunkAt === null) {
      firstChunkAt = Date.now();
      console.info(`[functions/chat] TTFT=${firstChunkAt - startedAt}ms`);
    }
    return sseEvent(content, done);
  };

  try {
    const apiKey = process.env.OPENCODE_GO_API_KEY || '';
    const useMock =
      !apiKey || apiKey === 'sk-opencode-test-key' || apiKey.startsWith('sk-test');

    if (useMock) {
      for (const chunk of MOCK_RESPONSE) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        fullContent += chunk;
        yield emit(chunk, false);
      }
    } else {
      for await (const chunk of streamChat(history, { model })) {
        if (chunk.done) break;
        fullContent += chunk.content;
        yield emit(chunk.content, false);
      }
    }
  } catch (error) {
    console.error('[functions/chat] stream error:', error);
    yield emit('\n\n(エラーが発生しました)', false);
  }

  await service.addMessage(
    {
      conversationId,
      role: 'assistant',
      content: fullContent || '(No response)',
    },
    userId,
  );
  yield emit('', true);
  console.info(`[functions/chat] stream completed in ${Date.now() - startedAt}ms`);
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

    const conversation = await service.getConversation(conversationId, userId);
    if (!conversation) throw new AppError(404, 'Conversation not found');

    await service.addMessage(
      {
        conversationId,
        role: 'user',
        content: message,
        imageUrl: imageBase64 || undefined,
      },
      userId,
    );

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
      body: createResponseStream(history, conversation.model, conversationId, userId),
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
