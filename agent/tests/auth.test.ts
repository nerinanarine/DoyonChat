import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGatewayServer } from '../src/server';
import { AgentConfig } from '../src/config';
import { loadAuthConfig } from '../src/auth';

const STUB = path.join(__dirname, 'fixtures', 'piStub.js');

function baseConfig(): AgentConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    pi: { piBin: process.execPath, piArgs: [STUB], promptTimeoutMs: 5000 },
    gateway: {
      heartbeatMs: 60_000,
      runTtlMs: 600_000,
      registryMax: 50,
      maxRuns: 4,
      modelScope: [],
      defaultModel: undefined,
      toolsDangerous: [],
      tools: [],
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-')),
    },
  };
}

async function startServer(
  verifyAuth: (token: string) => Promise<void>,
): Promise<{ server: Server; url: string }> {
  const server = createGatewayServer(baseConfig(), () => undefined, verifyAuth);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

describe('gateway Managed Identity auth', () => {
  it('leaves /health public and guards other routes', async () => {
    const deny = async () => {
      throw new Error('deny');
    };
    const { server, url } = await startServer(deny);
    try {
      expect((await fetch(`${url}/health`)).status).toBe(200);
      expect(
        (await fetch(`${url}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
          .status,
      ).toBe(401);
      expect((await fetch(`${url}/runs/abc`)).status).toBe(401);
    } finally {
      server.close();
    }
  });

  it('rejects missing and invalid tokens with 401', async () => {
    const allow = async (token: string) => {
      if (token !== 'good-token') throw new Error('deny');
    };
    const { server, url } = await startServer(allow);
    try {
      const bad = await fetch(`${url}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad-token' },
        body: JSON.stringify({ approvalId: 'x', runId: 'y', approved: true }),
      });
      expect(bad.status).toBe(401);
      const body = (await bad.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('authentication');
    } finally {
      server.close();
    }
  });

  it('passes valid tokens through to handlers', async () => {
    const allow = async (token: string) => {
      if (token !== 'good-token') throw new Error('deny');
    };
    const { server, url } = await startServer(allow);
    try {
      const res = await fetch(`${url}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer good-token' },
        body: JSON.stringify({ approvalId: 'no-such', runId: 'no-such', approved: true }),
      });
      // 認証は通過し、承認ID不明の 404 に到達する
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('disables auth when tenant/audience are unset', () => {
    expect(loadAuthConfig({})).toBeNull();
    expect(loadAuthConfig({ GATEWAY_AUTH_TENANT: 't' })).toBeNull();
    expect(
      loadAuthConfig({ GATEWAY_AUTH_TENANT: 't', GATEWAY_AUTH_AUDIENCE: 'a' }),
    ).toEqual({ tenantId: 't', audience: 'a' });
  });
});
