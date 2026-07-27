import request from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, extractUserId } from '../../src/middleware/auth';

describe('auth middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should allow /api/health without token', async () => {
    process.env.AUTH_ENABLED = 'true';
    process.env.ENTRA_TENANT_ID = 'test-tenant';
    process.env.ENTRA_CLIENT_ID = 'test-client';

    const app = express();
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.use('/api', authMiddleware);
    app.use('/api', extractUserId);
    app.get('/api/test', (req: Request, res: Response) => {
      res.json({ userId: req.userId });
    });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should reject requests without token when auth is enabled', async () => {
    process.env.AUTH_ENABLED = 'true';
    process.env.ENTRA_TENANT_ID = 'test-tenant';
    process.env.ENTRA_CLIENT_ID = 'test-client';

    const app = express();
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.use('/api', authMiddleware);
    app.use('/api', extractUserId);
    app.get('/api/test', (req: Request, res: Response) => {
      res.json({ userId: req.userId });
    });

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(401);
  });

  it('should set dev-user when auth is disabled', async () => {
    process.env.AUTH_ENABLED = 'false';
    process.env.ENTRA_TENANT_ID = 'test-tenant';
    process.env.ENTRA_CLIENT_ID = 'test-client';

    const app = express();
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.use('/api', authMiddleware);
    app.use('/api', extractUserId);
    app.get('/api/test', (req: Request, res: Response) => {
      res.json({ userId: req.userId });
    });

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('dev-user');
  });
});
