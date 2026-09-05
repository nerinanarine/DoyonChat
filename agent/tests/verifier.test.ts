import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createVerifier } from '../src/auth';

const AUTH = { tenantId: 'tenant-123', audience: 'aud-456' };

function keyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function sign(privateKey: string, payload: Record<string, unknown>): string {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: 'kid-1',
    issuer: `https://login.microsoftonline.com/${AUTH.tenantId}/v2.0`,
  });
}

describe('createVerifier (self-signed RS256)', () => {
  it('accepts a well-formed token', async () => {
    const { publicKey, privateKey } = keyPair();
    const verify = createVerifier(AUTH, async () => publicKey);
    const token = sign(privateKey, {
      aud: AUTH.audience,
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    await expect(verify(token)).resolves.toBeUndefined();
  });

  it('rejects wrong audience', async () => {
    const { publicKey, privateKey } = keyPair();
    const verify = createVerifier(AUTH, async () => publicKey);
    const token = sign(privateKey, {
      aud: 'other-aud',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects expired tokens', async () => {
    const { publicKey, privateKey } = keyPair();
    const verify = createVerifier(AUTH, async () => publicKey);
    const token = sign(privateKey, {
      aud: AUTH.audience,
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects wrong issuer', async () => {
    const { publicKey, privateKey } = keyPair();
    const verify = createVerifier(AUTH, async () => publicKey);
    const token = jwt.sign(
      { aud: AUTH.audience, exp: Math.floor(Date.now() / 1000) + 300 },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: 'kid-1',
        issuer: 'https://sts.windows.net/other-tenant/',
      },
    );
    await expect(verify(token)).rejects.toThrow();
  });

  it('accepts v1-form MI issuer for the same tenant', async () => {
    const { publicKey, privateKey } = keyPair();
    const verify = createVerifier(AUTH, async () => publicKey);
    const token = jwt.sign(
      { aud: AUTH.audience, exp: Math.floor(Date.now() / 1000) + 300 },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: 'kid-1',
        issuer: 'https://sts.windows.net/tenant-123/',
      },
    );
    await expect(verify(token)).resolves.toBeUndefined();
  });
});
