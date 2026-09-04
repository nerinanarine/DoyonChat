import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticateRequest } from '../middleware/auth';
import { AppError, toHttpResponse } from '../middleware/errorHandler';
import {
  assertAgentEnabled,
  forwardApprove,
  forwardGetRun,
  loadAgentGatewayConfig,
} from '../services/agentGateway';
import { getRequiredString, readJsonBody } from './request';

/**
 * エージェント実行基盤（gateway）へのプロキシ 2 エンドポイント。
 * 認証・kill switch・入力検証を済ませ、本体は gateway へ転送する。
 * 権限注記: run/approval の会話所有者対応付けは Phase 2（セッション対応）で行う。
 * runId/approvalId は UUID（推測困難）だが、現状の proxy では取得者が実行所有者である検証はしない。
 */

export async function agentApproveHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await authenticateRequest(request);
    const config = loadAgentGatewayConfig();
    assertAgentEnabled(config);

    const body = await readJsonBody(request);
    const approvalId = getRequiredString(body, 'approvalId');
    const runId = getRequiredString(body, 'runId');
    // approved は boolean のみ採用。それ以外は安全側（拒否）に倒す。
    const approved = body.approved === true;

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
    await authenticateRequest(request);
    const config = loadAgentGatewayConfig();
    assertAgentEnabled(config);

    const runId = request.params.runId;
    if (!runId) throw new AppError(400, 'run id is required');

    const result = await forwardGetRun(config, runId);
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