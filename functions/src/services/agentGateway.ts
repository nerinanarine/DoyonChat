import { AppError } from '../middleware/errorHandler';
import { UpstreamError } from './opencodeGo';
import type { AgentApprovalLevel } from '../types';
import { GatewayTokenProvider } from './gatewayToken';

/**
 * Agent gateway（`agent/` の PiClient HTTP サーバー）へのプロキシ。
 * Errors は P2-003 流儀の安全なメッセージだけを返す。上流レスポンス本文・スタックを漏らさない。
 */

export interface AgentGatewayConfig {
  /** AGENT_GATEWAY_URL。未設定なら 503。 */
  baseUrl: string;
  /** AGENT_GATEWAY_AUDIENCE。未設定なら Authorization ヘッダを付与しない（開発 loopback）。 */
  audience: string;
  /** AGENT_ENABLED。既定は有効。false なら kill switch。 */
  enabled: boolean;
  /** Managed Identity トークン供給器（テスト注入用。省略時は環境変数から生成）。 */
  tokenProvider?: GatewayTokenProvider;
}

export function loadAgentGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
  tokenProvider?: GatewayTokenProvider,
): AgentGatewayConfig {
  const audience = env.AGENT_GATEWAY_AUDIENCE || '';
  return {
    baseUrl: env.AGENT_GATEWAY_URL || '',
    audience,
    enabled: env.AGENT_ENABLED !== 'false',
    tokenProvider: tokenProvider ?? new GatewayTokenProvider(audience),
  };
}

/** kill switch: AGENT_ENABLED=false のとき 2 エンドポイントは利用不可（404 AppError）。 */
export function assertAgentEnabled(config: AgentGatewayConfig): void {
  if (!config.enabled) {
    throw new AppError(404, 'Agent feature is not available');
  }
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/**
 * 認証ヘッダを組み立てる。audience 未設定（トークン null）なら Authorization を付けない。
 * トークン取得失敗は呼び出し側の forward で 503 'Agent service unavailable' に変換される。
 */
async function buildHeaders(config: AgentGatewayConfig): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await config.tokenProvider?.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function mapGatewayStatus(status: number): AppError {
  switch (status) {
    case 400:
      return new AppError(400, 'Invalid agent request');
    case 404:
      return new AppError(404, 'Agent run or approval not found');
    case 429:
      return new AppError(429, 'Agent service is busy');
    default:
      return new AppError(502, 'Agent service error');
  }
}

export interface ApproveRequest {
  approvalId: string;
  runId: string;
  approved: boolean;
}

export interface GatewayResult {
  status: number;
  body: unknown;
}

async function forward<T>(requestBuilder: () => Promise<T>): Promise<T> {
  try {
    return await requestBuilder();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'Agent service unavailable');
  }
}

/** POST /approve を gateway へ転送する。 */
export function forwardApprove(
  config: AgentGatewayConfig,
  payload: ApproveRequest,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 30_000,
): Promise<GatewayResult> {
  return forward(async () => {
    if (!config.baseUrl) throw new AppError(503, 'Agent service is not configured');
    const response = await fetchImpl(buildUrl(config.baseUrl, '/approve'), {
      method: 'POST',
      headers: await buildHeaders(config),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw mapGatewayStatus(response.status);
    const body = await response.json().catch(() => undefined);
    return { status: response.status, body };
  });
}

/** GET /runs/:id を gateway へ転送する。 */
export function forwardGetRun(
  config: AgentGatewayConfig,
  runId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 30_000,
): Promise<GatewayResult> {
  return forward(async () => {
    if (!config.baseUrl) throw new AppError(503, 'Agent service is not configured');
    const response = await fetchImpl(
      buildUrl(config.baseUrl, `/runs/${encodeURIComponent(runId)}`),
      {
        method: 'GET',
        headers: await buildHeaders(config),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) throw mapGatewayStatus(response.status);
    const body = await response.json().catch(() => undefined);
    return { status: response.status, body };
  });
}

/**
 * DELETE /sessions を gateway へ転送する（会話削除時の pi セッション資産破棄。RG-2 F2）。
 * 呼び出し側で fire-and-forget にすること。非 200 は呼び出し元へエラーとして返す。
 */
export function deleteGatewaySession(
  config: AgentGatewayConfig,
  payload: { userId: string; conversationId: string },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<void> {
  return forward(async () => {
    if (!config.baseUrl) throw new AppError(503, 'Agent service is not configured');
    const response = await fetchImpl(buildUrl(config.baseUrl, '/sessions'), {
      method: 'DELETE',
      headers: await buildHeaders(config),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw mapGatewayStatus(response.status);
  });
}

export interface GatewayPromptPayload {
  message: string;
  userId: string;
  conversationId: string;
  approvalLevel?: AgentApprovalLevel;
  model?: string;
  subagentModel?: string;
}

/** gateway から届く SSE `data:` 1行分のパース結果。 */
export type GatewayStreamEvent = Record<string, unknown>;

function parseSseDataLine(line: string): GatewayStreamEvent | null {
  const trimmed = line.trim();
  // heartbeat（`: ping`）・空行・`data:` 以外は無視する
  if (!trimmed.startsWith('data: ')) return null;
  const jsonStr = trimmed.slice(6);
  if (jsonStr === '[DONE]') return null;
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as GatewayStreamEvent;
  } catch {
    // 壊れた SSE data は無視して読み続ける（opencodeGo.normalizeProtocolStream と同じ流儀）
    return null;
  }
}

/**
 * gateway `POST /prompt` の SSE ストリームをパース済みイベントとして供給する。
 * - 非 200 応答は mapGatewayStatus の安全な AppError に変換（429 は rate_limit へ）
 * - 完了マーカー（done）なしでストリームが終わった場合は server エラーにする（通常チャットと同流儀）
 * - 呼び出し側の signal（クライアント切断）で abort されると AbortError が伝播する
 */
export async function* forwardPromptStream(
  config: AgentGatewayConfig,
  payload: GatewayPromptPayload,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<GatewayStreamEvent> {
  if (!config.baseUrl) throw new AppError(503, 'Agent service is not configured');

  let response: Response;
  try {
    response = await fetchImpl(buildUrl(config.baseUrl, '/prompt'), {
      method: 'POST',
      headers: await buildHeaders(config),
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'Agent service unavailable');
  }
  if (!response.ok) throw mapGatewayStatus(response.status);

  const reader = response.body?.getReader();
  if (!reader) throw new AppError(503, 'Agent service unavailable');
  const decoder = new TextDecoder();
  let buffer = '';
  let sawCompletion = false;
  let reachedEof = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEof = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const event = parseSseDataLine(line);
        if (!event) continue;
        if (event.done === true) sawCompletion = true;
        yield event;
      }
    }
    if (buffer.trim()) {
      const event = parseSseDataLine(buffer.trim());
      if (event) {
        if (event.done === true) sawCompletion = true;
        yield event;
      }
    }
  } finally {
    if (!reachedEof) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
  if (!sawCompletion) {
    throw new UpstreamError('server', 'Agent stream ended before completion marker');
  }
}