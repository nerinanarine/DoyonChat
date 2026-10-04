import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/conversationService';
import { normalizeAgentModel } from '../services/userSettingsService';
import { DEFAULT_MODEL_ID } from '../config/modelCatalog';
import { generateTitle, sanitizeGeneratedTitle } from '../services/opencodeGo';
import {
  deleteGatewaySession,
  loadAgentGatewayConfig,
} from '../services/agentGateway';
import { getOptionalString, getRequiredString, readJsonBody } from './request';

function getConversationId(request: HttpRequest): string {
  const id = request.params.id;
  if (!id) throw new AppError(400, 'conversation id is required');
  return id;
}

/**
 * リクエスト本文の agentModel を `opencode-go/<modelId>` に正規化する（P1-013）。
 * null/未指定/空文字は null（既定に戻す）。未知ID・他provider・非文字列は 400。
 */
function resolveAgentModel(body: Record<string, unknown>): string | null {
  const raw = body.agentModel;
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') {
    throw new AppError(400, 'agentModel must be a string');
  }
  if (raw.trim() === '') return null;
  const normalized = normalizeAgentModel(raw);
  if (normalized === null) {
    throw new AppError(400, 'agentModel must be a known model');
  }
  return normalized;
}

export async function conversationsHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    if (request.method === 'GET') {
      return { status: 200, jsonBody: await service.listConversations(userId) };
    }

    const body = await readJsonBody(request);
    // 新規会話は常に Agent モード固定。model はクライアント値を受けず既定値で作成する（FR-006）。
    // agentModel（会話単位の実行モデル）だけはクライアント指定を受け、カタログ検証する（P1-013）。
    const conversation = await service.createConversation(
      getOptionalString(body, 'title'),
      DEFAULT_MODEL_ID,
      userId,
      resolveAgentModel(body),
    );
    return { status: 201, jsonBody: conversation };
  } catch (error) {
    return toHttpResponse(error);
  }
}

/**
 * 会話削除に伴う pi セッション資産の破棄を gateway へ依頼する（RG-2 F2）。
 * fire-and-forget 前提：失敗しても削除本体の成否には影響させない。
 * kill switch（AGENT_ENABLED=false）または gateway 未設定時は何もしない。
 */
function notifyGatewaySessionDeleted(userId: string, conversationId: string): void {
  const config = loadAgentGatewayConfig();
  if (!config.enabled || !config.baseUrl) return;
  deleteGatewaySession(config, { userId, conversationId }).catch((error) => {
    console.error(
      '[functions/conversations] gateway session delete failed (non-blocking):',
      error,
    );
  });
}

export async function conversationHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const id = getConversationId(request);
    const conversation = await service.getConversation(id, userId);
    if (!conversation) throw new AppError(404, 'Conversation not found');

    if (request.method === 'GET') {
      const messages = await service.listMessages(id, userId);
      return { status: 200, jsonBody: { conversation, messages } };
    }

    const deleted = await service.deleteConversation(id, userId);
    if (!deleted) throw new AppError(404, 'Conversation not found');
    notifyGatewaySessionDeleted(userId, id);
    return { status: 204 };
  } catch (error) {
    return toHttpResponse(error);
  }
}

export async function titleHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const body = await readJsonBody(request);
    const title = getRequiredString(body, 'title').trim();
    if (Array.from(title).length > 100) {
      throw new AppError(400, 'title must be 100 characters or fewer');
    }
    const updated = await service.updateConversationTitle(
      getConversationId(request),
      title,
      userId,
    );
    if (!updated) throw new AppError(404, 'Conversation not found');
    return { status: 200, jsonBody: updated };
  } catch (error) {
    return toHttpResponse(error);
  }
}

export async function agentModelHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const body = await readJsonBody(request);
    const updated = await service.updateConversationAgentModel(
      getConversationId(request),
      resolveAgentModel(body),
      userId,
    );
    if (!updated) throw new AppError(404, 'Conversation not found');
    return { status: 200, jsonBody: updated };
  } catch (error) {
    return toHttpResponse(error);
  }
}

export async function titleAutoHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const body = await readJsonBody(request);
    const text = getRequiredString(body, 'text').trim();

    const conversation = await service.getConversation(getConversationId(request), userId);
    if (!conversation) throw new AppError(404, 'Conversation not found');

    let generated: string;
    try {
      generated = await generateTitle(text, undefined, conversation.id);
    } catch (error) {
      console.error('[functions/conversations] title generation failed:', error);
      throw new AppError(503, 'Title generation failed');
    }

    const fallback = Array.from(text).slice(0, 30).join('');
    const title = sanitizeGeneratedTitle(generated, fallback);

    const updated = await service.updateConversationTitle(conversation.id, title, userId);
    if (!updated) throw new AppError(404, 'Conversation not found');
    return { status: 200, jsonBody: updated };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('conversations', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'conversations',
  handler: conversationsHandler,
});

app.http('conversation', {
  methods: ['GET', 'DELETE'],
  authLevel: 'anonymous',
  route: 'conversations/{id}',
  handler: conversationHandler,
});

app.http('conversation-title', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'conversations/{id}/title',
  handler: titleHandler,
});

app.http('conversation-agent-model', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'conversations/{id}/agent-model',
  handler: agentModelHandler,
});

app.http('conversation-title-auto', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'conversations/{id}/title/auto',
  handler: titleAutoHandler,
});
