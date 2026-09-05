import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import * as service from '../services/conversationService';
import {
  assertAgentEnabled,
  forwardApprove,
  forwardGetRun,
  GatewayResult,
  loadAgentGatewayConfig,
} from '../services/agentGateway';
import { getRequiredString, readJsonBody } from './request';

/**
 * エージェント実行基盤（gateway）へのプロキシ 2 エンドポイント。
 * 認証・kill switch・入力検証を済ませ、本体は gateway へ転送する。
 *
 * 権限（RG-2 F1）: run レコードの `conversationId` に対応する会話を所有者として照合する。
 * 会話が存在しない・他人の会話・conversationId を持たない run は 404 で返す
 * （リソースの存在を漏らさない）。
 */

function notFoundRunError(): AppError {
  return new AppError(404, 'Agent run not found');
}

/**
 * gateway の run レコードが呼び出しユーザーの会話に紐づくことを検証する。
 * `GatewayResult` は forwardGetRun の成功結果を渡す（run 取得の二重呼び出しを避ける）。
 */
async function verifyRunOwnership(result: GatewayResult, userId: string): Promise<void> {
  if (result.status !== 200) {
    throw notFoundRunError();
  }
  const record = result.body;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw notFoundRunError();
  }
  const conversationId = (record as Record<string, unknown>).conversationId;
  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    throw notFoundRunError();
  }
  const conversation = await service.getConversation(conversationId, userId);
  if (!conversation) {
    throw notFoundRunError();
  }
}

export async function agentApproveHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const config = loadAgentGatewayConfig();
    assertAgentEnabled(config);

    const body = await readJsonBody(request);
    const approvalId = getRequiredString(body, 'approvalId');
    const runId = getRequiredString(body, 'runId');
    // approved は boolean のみ採用。それ以外は安全側（拒否）に倒す。
    const approved = body.approved === true;

    // 承認は実行所有者のみが送れる（他ユーザーの run への承認を 404 で拒否）
    const runResult = await forwardGetRun(config, runId);
    await verifyRunOwnership(runResult, userId);

    const result = await forwardApprove(config, { approvalId, runId, approved });
    return { status: result.status, jsonBody: result.body };
  } catch (error) {
    return toHttpResponse(error);
  }
}

export async function agentRunHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const userId = await authenticateRequest(request);
    const config = loadAgentGatewayConfig();
    assertAgentEnabled(config);

    const runId = request.params.runId;
    if (!runId) throw new AppError(400, 'run id is required');

    const result = await forwardGetRun(config, runId);
    await verifyRunOwnership(result, userId);
    return { status: result.status, jsonBody: result.body };
  } catch (error) {
    return toHttpResponse(error);
  }
}

app.http('agent-approve', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'agent/approve',
  handler: agentApproveHandler,
});

app.http('agent-run', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agent/runs/{runId}',
  handler: agentRunHandler,
});