import { ApiError } from './api';

export type SafeErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'authentication'
  | 'network'
  | 'server';

export const SAFE_ERROR_MESSAGES: Record<SafeErrorCode, string> = {
  rate_limit: 'リクエストが多すぎます。しばらく待ってから再試行してください。',
  timeout: '応答に時間がかかりすぎました。再試行してください。',
  authentication: 'API キーが無効です。管理者にお問い合わせください。',
  network: '通信に失敗しました。接続を確認して再試行してください。',
  server: 'サーバーでエラーが発生しました。再試行してください。',
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