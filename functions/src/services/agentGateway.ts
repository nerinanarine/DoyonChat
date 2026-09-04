import { AppError } from '../middleware/errorHandler';

/**
 * Agent gateway（`agent/` の PiClient HTTP サーバー）へのプロキシ。
 * Errors は P2-003 流儀の安全なメッセージだけを返す。上流レスポンス本文・スタックを漏らさない。
 */

export interface AgentGatewayConfig {
  /** AGENT_GATEWAY_URL。未設定なら 503。 */
  baseUrl: string;
  /** AGENT_GATEWAY_KEY。未設定なら Authorization ヘッダを付与しない。 */
  key?: string;
  /** AGENT_ENABLED。既定は有効。false なら kill switch。 */
  enabled: boolean;
}

export function loadAgentGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentGatewayConfig {
  return {
    baseUrl: env.AGENT_GATEWAY_URL || '',
    key: env.AGENT_GATEWAY_KEY || undefined,
    enabled: env.AGENT_ENABLED !== 'false',
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

function buildHeaders(key?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
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
      headers: buildHeaders(config.key),
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
        headers: buildHeaders(config.key),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) throw mapGatewayStatus(response.status);
    const body = await response.json().catch(() => undefined);
    return { status: response.status, body };
  });
}