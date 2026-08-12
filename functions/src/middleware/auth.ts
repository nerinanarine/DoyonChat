import { HttpRequest } from '@azure/functions';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { AppError } from './errorHandler';

let jwksClient: ReturnType<typeof jwksRsa> | null = null;
let jwksTenantId: string | null = null;

function isAuthenticationEnabled(): boolean {
  return process.env.AUTH_ENABLED !== 'false';
}

function getTenantId(): string {
  return process.env.ENTRA_TENANT_ID || 'common';
}

function getApiClientId(): string {
  return process.env.ENTRA_API_CLIENT_ID || '';
}

function getJwksClient() {
  const tenantId = getTenantId();
  if (!jwksClient || jwksTenantId !== tenantId) {
    jwksClient = jwksRsa({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    jwksTenantId = tenantId;
  }
  return jwksClient;
}

function getBearerToken(request: HttpRequest): string {
  const authorization = request.headers.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new AppError(401, 'Unauthorized: bearer token is required');
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError(401, 'Unauthorized: bearer token is required');
  }
  return token;
}

async function verifyToken(token: string): Promise<jwt.JwtPayload> {
  const getVerificationKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
    if (!header.kid) {
      callback(new Error('Unauthorized: token header does not contain kid'));
      return;
    }

    getJwksClient()
      .getSigningKey(header.kid)
      .then((key) => callback(null, key.getPublicKey()))
      .catch((error: Error) => callback(error));
  };

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getVerificationKey,
      {
        algorithms: ['RS256'],
        issuer: `https://login.microsoftonline.com/${getTenantId()}/v2.0`,
        audience: getApiClientId(),
      },
      (error, decoded) => {
        if (error) {
          reject(new AppError(401, 'Unauthorized: invalid or expired token'));
          return;
        }
        if (!decoded || typeof decoded === 'string' || typeof decoded.oid !== 'string') {
          reject(new AppError(401, 'Unauthorized: user identifier not found'));
          return;
        }
        resolve(decoded);
      },
    );
  });
}

export async function authenticateRequest(request: HttpRequest): Promise<string> {
  if (!isAuthenticationEnabled()) {
    return 'dev-user';
  }

  const payload = await verifyToken(getBearerToken(request));
  return payload.oid as string;
}
