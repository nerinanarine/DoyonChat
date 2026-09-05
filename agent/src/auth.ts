import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { AgentError } from './errors';

/**
 * Functions→gateway 間の Managed Identity 認証（P3-010 Phase 3）。
 * Functions のマネージド ID が gateway の audience 宛てに取得した Entra JWT を検証する。
 * テナント・audience 未設定時は認証なし（loopback 既定と併せた開発用。デプロイ時は必須）。
 */

export interface GatewayAuthConfig {
  tenantId: string;
  audience: string;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): GatewayAuthConfig | null {
  const tenantId = env.GATEWAY_AUTH_TENANT || '';
  const audience = env.GATEWAY_AUTH_AUDIENCE || '';
  if (!tenantId || !audience) return null;
  return { tenantId, audience };
}

export type VerifyAuth = (token: string) => Promise<void>;

type KeyProvider = (kid: string) => Promise<string>;

function jwksKeyProvider(auth: GatewayAuthConfig): KeyProvider {
  const client = jwksRsa({
    jwksUri: `https://login.microsoftonline.com/${auth.tenantId}/discovery/v2.0/keys`,
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
  return async (kid: string) => {
    const key = await client.getSigningKey(kid);
    return key.getPublicKey();
  };
}

export function createVerifier(auth: GatewayAuthConfig, getKey: KeyProvider = jwksKeyProvider(auth)): VerifyAuth {
  return async (token: string) => {
    await new Promise<void>((resolve, reject) => {
      const keyProvider: jwt.GetPublicKeyOrSecret = (header, callback) => {
        if (!header.kid) {
          callback(new Error('missing kid'));
          return;
        }
        getKey(header.kid).then(
          (key) => callback(null, key),
          (error: Error) => callback(error),
        );
      };
      jwt.verify(
        token,
        keyProvider,
        {
          algorithms: ['RS256'],
          issuer: `https://login.microsoftonline.com/${auth.tenantId}/v2.0`,
          audience: auth.audience,
        },
        (error) => {
          if (error) reject(new AgentError('authentication', 'invalid gateway token'));
          else resolve();
        },
      );
    });
  };
}

export function extractBearer(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token || null;
}
