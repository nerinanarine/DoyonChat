import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/conversationService';
import { classifyUpstreamError, SafeErrorCode } from '../services/opencodeGo';
import {
  AGENT_STARTING,
  AgentGatewayConfig,
  assertAgentEnabled,
  forwardPromptStream,
  GatewayPromptPayload,
  isGatewayUnavailable,
  loadAgentGatewayConfig,
} from '../services/agentGateway';
import { getSettings } from '../services/userSettingsService';
import { getOptionalString, getRequiredString, readJsonBody } from './request';

/** 旧通常チャット会話（agentMode: false）への送信時に返す案内（FR-009）。 */
const LEGACY_CONVERSATION_GUIDANCE =
  'この会話は旧チャット形式のため送信できません。新規のAgent会話を作成して続けてください。';

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

function sseErrorEvent(code: SafeErrorCode | typeof AGENT_STARTING): Uint8Array {
  const event = { error: { code } };
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
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

    // 旧通常チャット会話（agentMode: false）は履歴閲覧のみ。ユーザーメッセージ保存前に
    // fail fast で 409 を返し、新規 Agent 会話へ誘導する（FR-009）。
    if (!conversation.agentMode) {
      throw new AppError(409, LEGACY_CONVERSATION_GUIDANCE);
    }

    // エージェントモード会話は gateway 経由（画像非対応・kill switch・中継はすべてこちら）。
    return await handleAgentChat(
      conversationId,
      message,
      imageBase64,
      userMessageId,
      userId,
      conversation.agentModel,
    );
  } catch (error) {
    return toHttpResponse(error);
  }
}

/** gateway の HTTP ステータスを安全な SSE error code へ変換する。 */
function statusToSafeCode(status: number): SafeErrorCode {
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  return 'server';
}

/**
 * エージェントモード会話の入り口。ユーザーメッセージを保存し、gateway `POST /prompt` へ
 * 中継する SSE ストリームを返す。画像は非対応（400）。
 */
async function handleAgentChat(
  conversationId: string,
  message: string,
  imageBase64: string | undefined,
  userMessageId: string | undefined,
  userId: string,
  conversationAgentModel?: string | null,
): Promise<HttpResponseInit> {
  if (imageBase64) {
    throw new AppError(400, 'Images are not supported in agent mode');
  }

  // kill switch・未設定はユーザーメッセージ保存前に fail fast する（副作用なし）。
  const config = loadAgentGatewayConfig();
  assertAgentEnabled(config); // AGENT_ENABLED=false → 404（既存エージェントAPIと同じ挙動）

  const { settings } = await getSettings(userId);
  // 実行モデルの解決優先順位（P1-013 FR-006）: 会話override ＞ 設定 agentModel ＞ 未設定。
  // 未設定のときは payload.model を省略し、gateway 既定に委ねる。
  const resolvedModel = conversationAgentModel ?? settings.agentModel;
  const payload: GatewayPromptPayload = {
    message,
    userId,
    conversationId,
    approvalLevel: settings.agentApprovalLevel ?? 'dangerous-only',
    ...(resolvedModel ? { model: resolvedModel } : {}),
    ...(settings.agentSubagentModel ? { subagentModel: settings.agentSubagentModel } : {}),
  };

  // ユーザーメッセージは通常経路と同じ流儀で保存する（再試行は userMessageId で冪等）。
  if (userMessageId) {
    await service.addMessageIfAbsent(
      { id: userMessageId, conversationId, role: 'user', content: message },
      userId,
    );
  } else {
    await service.addMessage({ conversationId, role: 'user', content: message }, userId);
  }

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
    body: createAgentResponseStream(config, payload, conversationId, userId),
  };
}

/**
 * gateway の SSE を透過中継しつつ content/reasoning を蓄積し、通常経路と同じ
 * finalizeAssistant・中断部分保存で確定する。approvalRequest やエージェント進捗は
 * そのままパススルーする（フロント側が既存のイベント正規化で処理する）。
 * テストから直接駆動できるよう export する。
 */
export async function* createAgentResponseStream(
  config: AgentGatewayConfig,
  payload: GatewayPromptPayload,
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

  const emit = (content: string, done: boolean, reasoning?: string): Uint8Array => {
    if (firstChunkAt === null) {
      firstChunkAt = Date.now();
      console.info(`[functions/chat] agent TTFT=${firstChunkAt - startedAt}ms`);
    }
    return sseEvent(content, done, reasoning);
  };

  const sseRaw = (event: Record<string, unknown>): Uint8Array =>
    new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

  const reasoningCodepoints = (reasoning: string): number => Array.from(reasoning).length;

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
    // エージェント実行モデル（解決済み payload.model）を記録する。未設定時は省略。
    if (payload.model) assistantMessage.model = payload.model;
    if (reasoning) {
      assistantMessage.reasoning = truncateReasoning(reasoning);
    }
    await service.addMessage(assistantMessage, userId);
  };

  try {
    for await (const event of forwardPromptStream(
      config,
      payload,
      upstreamAbortController.signal,
    )) {
      if (event.error && typeof event.error === 'object') {
        // gateway からの安全な error code だけを通知し、本文は保存しない（通常経路と同じ）。
        savePartialOnStop = false;
        const code = (event.error as { code?: unknown }).code;
        const safeCode: SafeErrorCode = typeof code === 'string' ? (code as SafeErrorCode) : 'server';
        console.error(`[functions/chat] agent stream error: ${safeCode}`);
        yield sseErrorEvent(safeCode);
        return;
      }
      if (event.done === true) {
        break; // 完了マーカー：蓄積した本文を確定してから done を送る
      }
      if (typeof event.content === 'string') fullContent += event.content;
      if (typeof event.reasoning === 'string') fullReasoning += event.reasoning;
      yield sseRaw(event); // パススルー（content / approvalRequest / エージェント進捗）
    }

    await finalizeAssistant(fullContent || '(No response)', fullReasoning || undefined);
    yield emit('', true);
    console.info(
      `[functions/chat] agent stream completed in ${Date.now() - startedAt}ms ` +
        `reasoning=${reasoningCodepoints(fullReasoning)}`,
    );
  } catch (error) {
    // gateway 未起動（コールドスタート）は汎用 'server' ではなく専用コードで通知し、
    // フロントの起動中表示＋ポーリング＋自動再送（P2-018）を促す。
    if (isGatewayUnavailable(error)) {
      savePartialOnStop = false;
      console.info('[functions/chat] agent gateway cold start');
      try {
        yield sseErrorEvent(AGENT_STARTING);
      } catch {
        // 接続が既に切れている場合は送信失敗を無視する
      }
    } else {
      // gateway の HTTP エラー（429 rate_limit 等）は安全コードへ変換。クライアント切断は中断扱い。
      const classification =
        error instanceof AppError
          ? statusToSafeCode(error.statusCode)
          : classifyUpstreamError(error);
      if (classification === 'interrupted') {
        console.info('[functions/chat] agent stream interrupted by client');
      } else {
        savePartialOnStop = false;
        console.error(`[functions/chat] agent stream error: ${classification}`);
        try {
          yield sseErrorEvent(classification);
        } catch {
          // 接続が既に切れている場合は送信失敗を無視する
        }
      }
    }
  } finally {
    upstreamAbortController.abort();
    if (!finalized && savePartialOnStop) {
      try {
        // 停止時の中間保存：本文が空なら中断表示を使う（通常経路と同じ）
        const content = fullContent.trim() ? fullContent : INTERRUPTED_MESSAGE;
        const reasoning = fullReasoning || undefined;
        await finalizeAssistant(content, reasoning);
        console.info(
          `[functions/chat] agent partial stream finalized ` +
            `(content=${fullContent.length}, reasoning=${reasoningCodepoints(fullReasoning)})`,
        );
      } catch (error) {
        console.error('[functions/chat] agent partial assistant save failed');
      }
    }
  }
}

app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: chatHandler,
});
