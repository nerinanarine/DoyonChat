import { Request, Response, NextFunction } from 'express';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

const tenantId = process.env.ENTRA_TENANT_ID || 'common';
const apiClientId = process.env.ENTRA_API_CLIENT_ID || '';

const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

const getVerificationKey: GetVerificationKey = async (_req, token) => {
  const kid = token?.header.kid;
  if (!kid) {
    throw new Error('Unauthorized: token header does not contain kid');
  }
  const key = await jwksClient.getSigningKey(kid);
  return key.getPublicKey();
};

const jwtMiddleware = expressjwt({
  secret: getVerificationKey,
  algorithms: ['RS256'],
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: apiClientId,
}).unless({
  path: ['/api/health'],
});

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.AUTH_ENABLED === 'false') {
    next();
    return;
  }
  jwtMiddleware(req, res, next);
};

export function extractUserId(req: Request, res: Response, next: NextFunction): void {
  if (process.env.AUTH_ENABLED === 'false') {
    req.userId = 'dev-user';
    next();
    return;
  }

  const auth = req.auth;
  if (!auth?.oid) {
    res.status(401).json({ error: 'Unauthorized: user identifier not found' });
    return;
  }

  req.userId = auth.oid;
  next();
}
