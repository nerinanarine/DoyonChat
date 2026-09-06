import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGatewayServer } from '../src/server';
import { AgentConfig } from '../src/config';
const APPROVAL = path.join(__dirname, 'fixtures', 'piApproval.js');
const STUB = path.join(__dirname, 'fixtures', 'piStub.js');
const SILENT = path.join(__dirname, 'fixtures', 'piSilent.js');
const ENV_ECHO = path.join(__dirname, 'fixtures', 'piEnvEcho.js');
const MODELS = path.join(__dirname, 'fixtures', 'piModels.js');
const HOLD = path.join(__dirname, 'fixtures', 'piHold.js');

interface GatewayTestOptions {
  promptTimeoutMs?: number;
  approvalTimeoutMs?: number;
  heartbeatMs?: number;
  maxRuns?: number;
  modelScope?: string[];
  defaultModel?: string;
  toolsDangerous?: string[];
  tools?: string[];
  dataDir?: string;
  onLog?: (message: string) => void;
  piEnv?: Record<string, string>;
}

async function startServer(
  piArgs: string[],
  opts: GatewayTestOptions = {},
): Promise<{ server: Server; url: string }> {
  const config: AgentConfig = {
    host: '127.0.0.1',
    port: 0,
    pi: {
      piBin: process.execPath,
      piArgs,
      promptTimeoutMs: opts.promptTimeoutMs ?? 15000,
      approvalTimeoutMs: opts.approvalTimeoutMs ?? 5000,
      env: opts.piEnv,
    },
    gateway: {
      heartbeatMs: opts.heartbeatMs ?? 60_000,
      runTtlMs: 600_000,
      registryMax: 50,
      maxRuns: opts.maxRuns ?? 4,
      modelScope: opts.modelScope ?? [],
      defaultModel: opts.defaultModel,
      toolsDangerous: opts.toolsDangerous ?? [],
      tools: opts.tools ?? [],
      dataDir: opts.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-')),
    },
  };
  const server = createGatewayServer(config, opts.onLog);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

interface CollectedEvent {
  raw: string;
  data?: Record<string, unknown>;
}

/** SSE ストリームを読み、承認要求が出るまでイベントを集める。 */
async function readUntilApproval(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 10000,
): Promise<{ events: CollectedEvent[]; approvalId: string | null; runId: string | null; text: string }> {
  const decoder = new TextDecoder();
  const events: CollectedEvent[] = [];
  let text = '';
  let approvalId: string | null = null;
  let runId: string | null = null;
  const deadline = Date.now() + timeoutMs;
  let buf = '';
  while (Date.now() < deadline && !approvalId) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      text += `${line}\n`;
      if (!trimmed.startsWith('data: ')) continue;
      const data = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
      events.push({ raw: line, data });
      const req = data.approvalRequest as { id?: unknown; runId?: unknown; expired?: unknown } | undefined;
      if (req && typeof req.id === 'string' && !req.expired) {
        approvalId = req.id;
        runId = typeof req.runId === 'string' ? req.runId : null;
      }
    }
  }
  return { events, approvalId, runId, text };
}

async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

describe('gateway approval flow (approval stub pi)', () => {
  it('relays approval request and continues on approve', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-approval-'));
    const resultFile = path.join(dir, 'responses.jsonl');
    const { server, url } = await startServer([APPROVAL], {
      piEnv: { PI_APPROVAL_RESULT_FILE: resultFile },
    });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'read the file' }),
      });
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      const { approvalId, runId } = await readUntilApproval(reader);
      expect(approvalId).toBe('appr-1');
      expect(runId).toBeTruthy();

      const approve = await fetch(`${url}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, runId, approved: true }),
      });
      expect(approve.status).toBe(200);

      const rest = await readAll(reader);
      expect(rest).toContain('"done":true');
      expect(rest).toContain('approved-result');

      // 二重承認は 404 で自己修復する
      const approveAgain = await fetch(`${url}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, runId, approved: true }),
      });
      expect(approveAgain.status).toBe(404);

      const recorded = fs.readFileSync(resultFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(recorded).toEqual([{ type: 'extension_ui_response', id: 'appr-1', confirmed: true }]);
    } finally {
      delete process.env.PI_APPROVAL_RESULT_FILE;
      server.close();
    }
  });

  it('auto-rejects on approval timeout and settles with blocked result', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-approval-'));
    const resultFile = path.join(dir, 'responses.jsonl');
    const { server, url } = await startServer([APPROVAL], {
      approvalTimeoutMs: 300,
      piEnv: { PI_APPROVAL_RESULT_FILE: resultFile },
    });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'read the file' }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('"expired":true');
      expect(text).toContain('blocked-result');
      expect(text).toContain('"done":true');

      const recorded = fs.readFileSync(resultFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(recorded).toEqual([{ type: 'extension_ui_response', id: 'appr-1', cancelled: true }]);
    } finally {
      server.close();
    }
  });

  it('pauses the run budget while waiting for approval', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-approval-'));
    const resultFile = path.join(dir, 'responses.jsonl');
    // run 予算 1200ms に対し承認を 1500ms 後に返す。予算停止が効けば approved で完了する。
    const { server, url } = await startServer([APPROVAL], {
      promptTimeoutMs: 1200,
      approvalTimeoutMs: 10000,
      piEnv: { PI_APPROVAL_RESULT_FILE: resultFile },
    });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'read the file' }),
      });
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      const { approvalId, runId } = await readUntilApproval(reader);
      expect(approvalId).toBe('appr-1');
      await new Promise((r) => setTimeout(r, 1500));
      const approve = await fetch(`${url}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, runId, approved: true }),
      });
      expect(approve.status).toBe(200);
      const rest = await readAll(reader);
      expect(rest).toContain('approved-result');
      expect(rest).toContain('"done":true');
    } finally {
      server.close();
    }
  });

  it('rejects unknown approval ids with 404', async () => {
    const { server, url } = await startServer([APPROVAL]);
    try {
      const res = await fetch(`${url}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: 'no-such-id', runId: 'no-such-run', approved: true }),
      });
      expect(res.status).toBe(404);

      const missingRunId = await fetch(`${url}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: 'appr-1', approved: true }),
      });
      expect(missingRunId.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it('rejects prompts over the concurrency cap with 429', async () => {
    const { server, url } = await startServer([SILENT], { maxRuns: 1 });
    const first = new AbortController();
    try {
      const occupying = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'occupy the slot' }),
        signal: first.signal,
      });
      expect(occupying.status).toBe(200);
      // SILENT は settle しないためスロットは埋まったまま。2 件目は 429。
      const rejected = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'over the cap' }),
      });
      expect(rejected.status).toBe(429);
      const body = (await rejected.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('rate_limit');
      first.abort();
      await occupying.body?.cancel().catch(() => undefined);
    } finally {
      server.close();
    }
  });
});

describe('gateway heartbeat and run registry', () => {
  it('sends heartbeat comments and keeps interrupted partial runs fetchable', async () => {
    const { server, url } = await startServer([SILENT], { heartbeatMs: 100 });
    try {
      const controller = new AbortController();
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'never settles' }),
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      const runId = res.headers.get('x-run-id');
      expect(runId).toBeTruthy();

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let seenPing = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !seenPing) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.split('\n').some((l) => l.startsWith(':'))) seenPing = true;
      }
      expect(seenPing).toBe(true);

      controller.abort();
      await reader.cancel().catch(() => undefined);

      let status: string | null = null;
      const pollDeadline = Date.now() + 10000;
      while (Date.now() < pollDeadline && status !== 'interrupted') {
        await new Promise((r) => setTimeout(r, 200));
        const run = await fetch(`${url}/runs/${runId}`);
        if (run.status === 200) {
          const record = (await run.json()) as { status?: string };
          status = record.status ?? null;
        }
      }
      expect(status).toBe('interrupted');
    } finally {
      server.close();
    }
  });

  it('returns settled runs with final text for resubscribe', async () => {
    const { server, url } = await startServer([STUB]);
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello resubscribe' }),
      });
      const text = await res.text();
      const doneLine = text
        .split('\n')
        .find((l) => l.includes('"done":true'));
      expect(doneLine).toBeTruthy();
      const done = JSON.parse(doneLine!.slice(doneLine!.indexOf('data: ') + 6)) as {
        runId?: string;
        finalText?: string;
      };
      expect(done.runId).toBeTruthy();

      const run = await fetch(`${url}/runs/${done.runId}`);
      expect(run.status).toBe(200);
      const record = (await run.json()) as {
        status?: string;
        finalText?: string;
        events?: unknown[];
      };
      expect(record.status).toBe('settled');
      expect(record.finalText).toContain('hello resubscribe');
      expect(Array.isArray(record.events)).toBe(true);

      const missing = await fetch(`${url}/runs/does-not-exist`);
      expect(missing.status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe('gateway per-run approval env injection', () => {
  it('passes approvalLevel and dangerousTools to the pi process env', async () => {
    const { server, url } = await startServer([ENV_ECHO]);
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'echo env',
          approvalLevel: 'always',
          dangerousTools: ['read'],
        }),
      });
      const text = await res.text();
      expect(text).toContain('level=always');
      expect(text).toContain('tools=read');
    } finally {
      server.close();
    }
  });

  it('ignores invalid approval levels (gateway default applies)', async () => {
    const { server, url } = await startServer([ENV_ECHO]);
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'echo env', approvalLevel: 'bogus' }),
      });
      const text = await res.text();
      expect(text).toContain('level=(unset)');
      expect(text).toContain('"done":true');
    } finally {
      server.close();
    }
  });

  it('applies the allowlist dangerous table when the request omits it', async () => {
    const { server, url } = await startServer([ENV_ECHO], { toolsDangerous: ['read'] });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'echo env' }),
      });
      const text = await res.text();
      expect(text).toContain('tools=read');
    } finally {
      server.close();
    }
  });

  it('intersects request dangerous tools with enabled tools', async () => {
    const { server, url } = await startServer([ENV_ECHO], { tools: ['read'] });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'echo env', dangerousTools: ['read', 'write'] }),
      });
      const text = await res.text();
      expect(text).toContain('tools=read');
      expect(text).not.toContain('write');
    } finally {
      server.close();
    }
  });
});

describe('gateway model catalog and selection', () => {
  it('lists scoped models from the pi catalog', async () => {
    const { server, url } = await startServer([MODELS], { modelScope: ['test-provider/*'] });
    try {
      const res = await fetch(`${url}/models`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { models?: Array<{ id?: string }> };
      expect(body.models?.map((m) => m.id)).toEqual(['good-model']);
    } finally {
      server.close();
    }
  });

  it('lists everything on empty scope', async () => {
    const { server, url } = await startServer([MODELS]);
    try {
      const res = await fetch(`${url}/models`);
      const body = (await res.json()) as { models?: Array<{ id?: string }> };
      expect(body.models?.map((m) => m.id)?.sort()).toEqual(['good-model', 'other-model']);
    } finally {
      server.close();
    }
  });

  it('applies set_model for in-scope models on prompt', async () => {
    const { server, url } = await startServer([MODELS], { modelScope: ['test-provider/*'] });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi', model: 'test-provider/good-model' }),
      });
      const text = await res.text();
      expect(text).toContain('model-ok');
      expect(text).toContain('"done":true');
    } finally {
      server.close();
    }
  });

  it('rejects out-of-scope and malformed models with 400', async () => {
    const { server, url } = await startServer([MODELS], { modelScope: ['test-provider/*'] });
    try {
      const outOfScope = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi', model: 'other-provider/other-model' }),
      });
      expect(outOfScope.status).toBe(400);

      const malformed = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi', model: 'bare-id' }),
      });
      expect(malformed.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it('returns a safe error when set_model fails', async () => {
    const { server, url } = await startServer([MODELS], { modelScope: ['test-provider/*'] });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi', model: 'test-provider/fail-model' }),
      });
      const text = await res.text();
      expect(text).toContain('"error":{"code":"server"}');
    } finally {
      server.close();
    }
  });

  it('pins the configured default model when the request omits it', async () => {
    const { server, url } = await startServer([MODELS], {
      modelScope: ['test-provider/*'],
      defaultModel: 'test-provider/fail-model',
    });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi' }),
      });
      // fail-model への set_model が送られた証拠に server エラーになる
      const text = await res.text();
      expect(text).toContain('"error":{"code":"server"}');
    } finally {
      server.close();
    }
  });

  it('prefers the request model over the configured default', async () => {
    const { server, url } = await startServer([MODELS], {
      modelScope: ['test-provider/*'],
      defaultModel: 'test-provider/fail-model',
    });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi', model: 'test-provider/good-model' }),
      });
      const text = await res.text();
      expect(text).toContain('model-ok');
      expect(text).toContain('"done":true');
    } finally {
      server.close();
    }
  });
});

describe('gateway conversation sessions', () => {
  it('writes per-user settings and settles prompts with ids', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-'));
    const { server, url } = await startServer([MODELS], { dataDir, tools: ['read'] });
    try {
      const res = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'hi',
          userId: 'user-1',
          conversationId: 'conv-1',
          subagentModel: 'test-provider/good-model',
        }),
      });
      const text = await res.text();
      expect(text).toContain('model-ok');
      expect(text).toContain('"done":true');

      const settings = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'users', 'user-1', 'config', 'settings.json'), 'utf8'),
      );
      expect(settings.subagents.defaultModel).toBe('test-provider/good-model');
      expect(settings.packages).toEqual(['npm:pi-subagents']);
      expect(fs.existsSync(path.join(dataDir, 'sessions', 'user-1'))).toBe(true);
    } finally {
      server.close();
    }
  });

  it('rejects partial ids and traversal with 400', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-'));
    const { server, url } = await startServer([MODELS], { dataDir, modelScope: ['test-provider/*'] });
    try {
      const post = (body: unknown) =>
        fetch(`${url}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      expect((await post({ message: 'hi', userId: 'user-1' })).status).toBe(400);
      expect((await post({ message: 'hi', userId: '../x', conversationId: 'c1' })).status).toBe(400);
      expect((await post({ message: 'hi', userId: 'u1', conversationId: 'a/b' })).status).toBe(400);
      // subagentModel も model と同一のスコープ検証を受ける（F1 回帰）
      const base = { message: 'hi', userId: 'u1', conversationId: 'c1' };
      expect(
        (await post({ ...base, subagentModel: 'other-provider/other-model' })).status,
      ).toBe(400);
      expect((await post({ ...base, subagentModel: 'bare-id' })).status).toBe(400);
      expect(
        (await post({ ...base, subagentModel: 'test-provider/good-model' })).status,
      ).toBe(200);
    } finally {
      server.close();
    }
  });

  it('deletes session files on request and tolerates missing ones', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-'));
    const { server, url } = await startServer([MODELS], { dataDir });
    const del = (body: unknown) =>
      fetch(`${url}/sessions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    try {
      const file = path.join(dataDir, 'sessions', 'user-1', 'conv-9.jsonl');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '{}');
      const res = await del({ userId: 'user-1', conversationId: 'conv-9' });
      expect(res.status).toBe(200);
      expect(fs.existsSync(file)).toBe(false);

      const missing = await del({ userId: 'user-1', conversationId: 'nope' });
      expect(missing.status).toBe(200);

      const bad = await del({ userId: '../x', conversationId: 'c1' });
      expect(bad.status).toBe(400);
    } finally {
      server.close();
    }
  });
});

describe('gateway conversation in-flight guard', () => {
  it('rejects a second run for the same conversation with 429', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-'));
    const { server, url } = await startServer([HOLD], { dataDir });
    const first = new AbortController();
    const second = new AbortController();
    try {
      const firstRes = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'first', userId: 'user-1', conversationId: 'conv-1' }),
        signal: first.signal,
      });
      expect(firstRes.status).toBe(200);

      const sameConv = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'second', userId: 'user-1', conversationId: 'conv-1' }),
      });
      expect(sameConv.status).toBe(429);
      const body = (await sameConv.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('rate_limit');

      // 別会話は並行実行できる
      const otherConv = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'other', userId: 'user-1', conversationId: 'conv-2' }),
        signal: second.signal,
      });
      expect(otherConv.status).toBe(200);
    } finally {
      first.abort();
      second.abort();
      server.close();
    }
  });

  it('releases the guard after the run settles', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-data-'));
    const { server, url } = await startServer([MODELS], { dataDir });
    try {
      const firstRes = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'settles', userId: 'user-1', conversationId: 'conv-3' }),
      });
      const text = await firstRes.text();
      expect(text).toContain('"done":true');

      // settled 後は同じ会話の新しい run を開始できる
      const again = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'again', userId: 'user-1', conversationId: 'conv-3' }),
      });
      expect(again.status).toBe(200);
      expect((await again.text())).toContain('"done":true');
    } finally {
      server.close();
    }
  });
});
