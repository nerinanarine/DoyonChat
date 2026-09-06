import { DefaultAzureCredential, TokenCredential, AccessToken } from '@azure/identity';

/**
 * Functions→gateway 間の Managed Identity 認証トークン供給 (P3-010 RG-3 F-1)。
 *
 * Functions のシステム割当マネージド ID（ローカルでは `az` CLI 資格情報）で
 * Entra から `AGENT_GATEWAY_AUDIENCE` 宛ての JWT を取得し、Authorization: Bearer に載せる。
 * gateway 側 (`GATEWAY_AUTH_TENANT` / `GATEWAY_AUTH_AUDIENCE`) は同一 audience で検証する。
 *
 * - audience 未設定時はトークンなし（開発 loopback。gateway 側の認証無効と対になる）
 * - 取得トークンはキャッシュし、失効 5 分前になったら再取得する
 * - 取得失敗は呼び出し側（プロキシ）で 503 に変換される
 */

export interface GatewayTokenConfig {
  /** gateway の JWT audience（App registration の Application ID / Application ID URI）。空なら無効。 */
  audience: string;
}

/** 失効前に再取得する余裕時間。発行後この秒数が残っていればキャッシュを使う。 */
export const GATEWAY_TOKEN_REFRESH_BEFORE_EXPIRY_MS = 5 * 60_000;

export function loadGatewayTokenConfig(env: NodeJS.ProcessEnv = process.env): GatewayTokenConfig {
  return {
    audience: env.AGENT_GATEWAY_AUDIENCE || '',
  };
}

/**
 * MI トークンの供給器。audience 未設定時は何もせず null を返す。
 * `credential`/`now` はテスト注入用（省略時は DefaultAzureCredential / Date.now）。
 */
export class GatewayTokenProvider {
  private cached: { token: string; expiresOn: number } | null = null;

  constructor(
    private readonly audience: string,
    private readonly credential: TokenCredential | null = audience ? new DefaultAzureCredential() : null,
    private readonly now: () => number = Date.now,
  ) {}

  /** audience 未設定（認証無効）なら true。 */
  isDisabled(): boolean {
    return this.audience === '';
  }

  /**
   * トークンを返す。audience 未設定なら null（ヘッダ無し = 開発 loopback）。
   * キャッシュが失効 5 分前を切っている場合は再取得する。
   */
  async get(): Promise<string | null> {
    if (this.audience === '' || this.credential === null) return null;
    const now = this.now();
    if (this.cached && this.cached.expiresOn - now > GATEWAY_TOKEN_REFRESH_BEFORE_EXPIRY_MS) {
      return this.cached.token;
    }
    const accessToken: AccessToken | null = await this.credential.getToken(
      `${this.audience}/.default`,
    );
    if (!accessToken || !accessToken.token || !accessToken.expiresOnTimestamp) {
      throw new Error('Failed to acquire gateway token');
    }
    // expiresOnTimestamp はミリ秒 (UNIX epoch)。@azure/core-auth の契約どおりそのまま使う。
    const expiresOn = accessToken.expiresOnTimestamp;
    this.cached = { token: accessToken.token, expiresOn };
    return accessToken.token;
  }
}