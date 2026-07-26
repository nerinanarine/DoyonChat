import request from 'supertest';
import express, { Request, Response } from 'express';

describe('auth middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createApp(authEnabled: string, tenantId: string, clientId: string) {
    process.env.AUTH_ENABLED = authEnabled;
    process.env.ENTRA_TENANT_ID = tenantId;
    process.env.ENTRA_CLIENT_ID = clientId;

    const { authMiddleware, extractUserId } = require('../../src/middleware/auth');

    const app = express();
    app.get('/api/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
    app.use('/api', authMiddleware);
    app.use('/api', extractUserId);
    app.get('/api/test', (req: Request, res: Response) => {
      res.json({ userId: req.userId });
    });

    return app;
  }

  it('should allow /api/health without token', async () => {
    const app = createApp('true', 'test-tenant', 'test-client');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should reject requests without token when auth is enabled', async () => {
    const app = createApp('true', 'test-tenant', 'test-client');
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(401);
  });

  it('should set dev-user when auth is disabled', async () => {
    const app = createApp('false', 'test-tenant', 'test-client');
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('dev-user');
  });
});
