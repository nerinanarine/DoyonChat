import { Request, Response, NextFunction } from 'express';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

const tenantId = process.env.ENTRA_TENANT_ID || 'common';
const clientId = process.env.ENTRA_CLIENT_ID || '';
const authEnabled = process.env.AUTH_ENABLED !== 'false';

const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

export const authMiddleware = expressjwt({
  secret: jwksClient.getSigningKey as GetVerificationKey,
  algorithms: ['RS256'],
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: clientId,
}).unless({
  path: ['/api/health'],
});

export function extractUserId(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled) {
    req.userId = 'dev-user';
    next();
    return;
  }

  const auth = req.auth as { oid?: string } | undefined;
  if (!auth?.oid) {
    res.status(401).json({ error: 'Unauthorized: user identifier not found' });
    return;
  }

  req.userId = auth.oid;
  next();
}
