import { ApiError } from './api';

export type SafeErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'authentication'
  | 'network'
  | 'server'
  | 'agent-starting'
  | 'legacy-conversation';

export const SAFE_ERROR_MESSAGES: Record<SafeErrorCode, string> = {
  rate_limit: 'リクエストが多すぎます。しばらく待ってから再試行してください。',
  timeout: '応答に時間がかかりすぎました。再試行してください。',
  authentication: 'API キーが無効です。管理者にお問い合わせください。',
  network: '通信に失敗しました。接続を確認して再試行してください。',
  server: 'サーバーでエラーが発生しました。再試行してください。',
  // コールドスタートは起動中表示（LoadingState）へ回すため通常は表示しない。
  'agent-starting': 'エージェントサービスを起動しています。',
  // 旧通常チャット会話（agentMode: false）への送信。新規 Agent 会話への案内（FR-009）。
  'legacy-conversation':
    'この会話は旧チャット形式のため送信できません。新規のAgent会話を作成して続けてください。',
};

const SAFE_CODES = new Set(Object.keys(SAFE_ERROR_MESSAGES));

export function isSafeCode(value: unknown): value is SafeErrorCode {
  return typeof value === 'string' && SAFE_CODES.has(value);
}

/** チャットSSE内の安全なエラーイベント（`{"error":{"code":"..."}}`）を表す。 */
export class ChatStreamError extends Error {
  constructor(
    public readonly code: SafeErrorCode,
    message = SAFE_ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = 'ChatStreamError';
  }
}

function codeForStatus(status: number): SafeErrorCode {
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 409) return 'legacy-conversation';
  return status >= 500 ? 'server' : 'network';
}

/** APIエラーを安全なコードへ正規化する（ユーザー停止のAbortErrorは除外済みとして扱う）。 */
export function classifyError(error: unknown): SafeErrorCode {
  if (error instanceof ApiError) {
    return codeForStatus(error.status);
  }
  if (isSafeCode((error as { code?: unknown }).code)) {
    return (error as { code: SafeErrorCode }).code;
  }
  return 'network';
}

/** UIへ表示するユーザー向けメッセージを返す。生のレスポンス本文やキーは含めない。 */
export function errorMessage(error: unknown): string {
  return SAFE_ERROR_MESSAGES[classifyError(error)];
}

/**
 * コールドスタート（gateway 未起動）由来のエラーか（P2-018 FR-003/P2-018 FR-006）。
 * 送信経路は SSE の専用コード `agent-starting`、承認・run 経路は中継の
 * 503 'Agent service unavailable' で判定する（設定不備の 503 は対象外）。
 */
export function isColdStartError(error: unknown): boolean {
  if (error instanceof ChatStreamError) {
    return error.code === 'agent-starting';
  }
  if (error instanceof ApiError) {
    return error.status === 503 && error.message.includes('Agent service unavailable');
  }
  return false;
}
