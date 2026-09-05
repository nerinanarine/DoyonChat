import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGatewayServer } from '../src/server';
import { AgentConfig } from '../src/config';

const STUB = path.join(__dirname, 'fixtures', 'piStub.js');
const CRASH = path.join(__dirname, 'fixtures', 'piCrash.js');
const SILENT = path.join(__dirname, 'fixtures', 'piSilent.js');

async function startServer(
  piArgs: string[],
  promptTimeoutMs = 5000,
  onLog: (message: string) => void = () => undefined,
): Promise<{ server: Server; url: string }> {
  const config: AgentConfig = {
    host: '127.0.0.1',
    port: 0,
    pi: { piBin: process.execPath, piArgs, promptTimeoutMs, approvalTimeoutMs: 5000 },
    gateway: { heartbeatMs: 60_000, runTtlMs: 600_000, registryMax: 50, maxRuns: 4, modelScope: [], dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-')) },
  };
  const server = createGatewayServer(config, onLog);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

describe('gateway server (stub pi)', () => {
  it('GET /health reports ok with pi configuration', async () => {
    const { server, url } = await startServer([STUB]);
    try {
      const res = await fetch(`${url}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status?: string;
        piBin?: string;
        piArgs?: string[];
      };
      expect(body.status).toBe('ok');
      expect(body.piBin).toBe(process.execPath);
      expect(body.piArgs).toEqual([STUB]);
    } finally {
      server.close();
    }
  });

  it('POST /prompt relays pi events and returns final text via SSE', async () => {
    const { server, url } = await startServer([STUB]);
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello from server test' }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('"type":"agent_settled"');
      expect(text).toContain('"done":true');
      expect(text).toContain('echo: hello from server test');
    } finally {
      server.close();
    }
  });

  it('POST /prompt rejects invalid body with 400', async () => {
    const { server, url } = await startServer([STUB]);
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it('POST /prompt returns server error event when pi process dies', async () => {
    const { server, url } = await startServer([CRASH]);
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'boom' }),
      });
      // SSE はヘッダ送信後に開始するため 200。エラーはイベントで通知される
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('"error":{"code":"server"}');
    } finally {
      server.close();
    }
  });

  it('POST /prompt reclaims pi process when client disconnects', async () => {
    const logs: string[] = [];
    const { server, url } = await startServer([SILENT], 15000, (m) => logs.push(m));
    try {
      const controller = new AbortController();
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'never settles' }),
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      const reader = res.body?.getReader();
      await reader?.read(); // 先頭チャンク受信後に切断する
      controller.abort();
      await reader?.cancel().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));
      expect(logs.some((m) => m.includes('client disconnected'))).toBe(true);
      // サーバーは健全なまま次の依頼を受けられる
      const health = await fetch(`${url}/health`);
      expect(health.status).toBe(200);
    } finally {
      server.close();
    }
  });
});