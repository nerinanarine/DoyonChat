import { generateKeyPairSync } from 'crypto';
import { HttpRequest } from '@azure/functions';
import jwt from 'jsonwebtoken';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const originalAuthEnabled = process.env.AUTH_ENABLED;
const originalTenantId = process.env.ENTRA_TENANT_ID;
const originalApiClientId = process.env.ENTRA_API_CLIENT_ID;

describe('Functions authentication', () => {
  let authenticateRequest: typeof import('../../src/middleware/auth').authenticateRequest;
  let mockGetSigningKey: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env.ENTRA_TENANT_ID = 'test-tenant';
    process.env.ENTRA_API_CLIENT_ID = 'test-api-client';
    mockGetSigningKey = jest.fn().mockResolvedValue({
      getPublicKey: () => publicKey,
    });
    jest.doMock('jwks-rsa', () =>
      jest.fn(() => ({
        getSigningKey: mockGetSigningKey,
      })),
    );
    authenticateRequest = require('../../src/middleware/auth').authenticateRequest;
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (originalAuthEnabled === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuthEnabled;
    if (originalTenantId === undefined) delete process.env.ENTRA_TENANT_ID;
    else process.env.ENTRA_TENANT_ID = originalTenantId;
    if (originalApiClientId === undefined) delete process.env.ENTRA_API_CLIENT_ID;
    else process.env.ENTRA_API_CLIENT_ID = originalApiClientId;
  });

  it('returns dev-user when authentication is disabled', async () => {
    process.env.AUTH_ENABLED = 'false';

    const userId = await authenticateRequest(
      new HttpRequest({ method: 'GET', url: 'http://localhost/' }),
    );

    expect(userId).toBe('dev-user');
    expect(mockGetSigningKey).not.toHaveBeenCalled();
  });

  it('rejects a request without a bearer token when authentication is enabled', async () => {
    process.env.AUTH_ENABLED = 'true';

    await expect(
      authenticateRequest(
        new HttpRequest({ method: 'GET', url: 'http://localhost/', headers: {} }),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('extracts oid from a valid Entra ID token', async () => {
    process.env.AUTH_ENABLED = 'true';
    const token = jwt.sign(
      { oid: 'alice' },
      privateKey,
      {
        algorithm: 'RS256',
        issuer: 'https://login.microsoftonline.com/test-tenant/v2.0',
        audience: 'test-api-client',
        expiresIn: '1h',
        keyid: 'test-key',
      },
    );

    const userId = await authenticateRequest(
      new HttpRequest({
        method: 'GET',
        url: 'http://localhost/',
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(userId).toBe('alice');
    expect(mockGetSigningKey).toHaveBeenCalledWith('test-key');
  });

  it('rejects an expired Entra ID token', async () => {
    process.env.AUTH_ENABLED = 'true';
    const token = jwt.sign(
      { oid: 'alice' },
      privateKey,
      {
        algorithm: 'RS256',
        issuer: 'https://login.microsoftonline.com/test-tenant/v2.0',
        audience: 'test-api-client',
        expiresIn: -1,
        keyid: 'test-key',
      },
    );

    await expect(
      authenticateRequest(
        new HttpRequest({
          method: 'GET',
          url: 'http://localhost/',
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
