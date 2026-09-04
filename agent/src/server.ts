import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AgentConfig } from './config';
import { AgentError } from './errors';
import { PiClient } from './piClient';
import { RunRegistry } from './registry';
import { normalizePiEventForSSE } from './normalize';

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  });
  res.end(payload);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch {
        reject(new AgentError('network', 'invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sse(res: ServerResponse, payload: unknown): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

interface ApprovalTarget {
  client: PiClient;
  runId: string;
}

/**
 * Phase 1 の gateway サーバー:
 * - GET /health: 生存確認
 * - POST /prompt {message}: pi に prompt を送りイベントを SSE で中継する。
 *   承認要求は {approvalRequest}、無音期間は `: ping` heartbeat、完了は {done, runId, finalText}
 * - POST /approve {approvalId, approved}: 承認応答を pi へ届ける
 * - GET /runs/:id: 実行レコード（再購読・最終回答回収用）
 * - クライアント切断時は graceful に abort して部分結果をレジストリへ残す
 */
export function createGatewayServer(
  config: AgentConfig,
  onLog: (message: string) => void = () => undefined,
) {
  const registry = new RunRegistry(config.gateway.registryMax, config.gateway.runTtlMs);
  const approvals = new Map<string, ApprovalTarget>();
  const limiter = { activeRuns: 0, maxRuns: config.gateway.maxRuns };
  const server = createServer((req, res) => {
    void handleRequest(req, res, config, registry, approvals, limiter, onLog);
  });

  server.on('clientError', (_err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: AgentConfig,
  registry: RunRegistry,
  approvals: Map<string, ApprovalTarget>,
  limiter: { activeRuns: number; maxRuns: number },
  onLog: (message: string) => void,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      writeJson(res, 200, {
        status: 'ok',
        pid: process.pid,
        uptimeMs: Math.round(process.uptime() * 1000),
        piBin: config.pi.piBin,
        piArgs: config.pi.piArgs,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/prompt') {
      if (limiter.activeRuns >= limiter.maxRuns) {
        writeJson(res, 429, { error: { code: 'rate_limit' } });
        return;
      }
      limiter.activeRuns++;
      try {
        await handlePrompt(req, res, config, registry, approvals, onLog);
      } finally {
        limiter.activeRuns--;
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/approve') {
      await handleApprove(req, res, approvals);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/runs/')) {
      const runId = url.pathname.slice('/runs/'.length);
      const record = runId ? registry.get(runId) : undefined;
      if (!record) {
        writeJson(res, 404, { error: { code: 'server' } });
        return;
      }
      writeJson(res, 200, record);
      return;
    }

    writeJson(res, 404, { error: { code: 'server' } });
  } catch (error) {
    const code = error instanceof AgentError ? error.code : 'server';
    writeJson(res, error instanceof AgentError && code === 'network' ? 400 : 500, {
      error: { code },
    });
  }
}

async function handleApprove(
  req: IncomingMessage,
  res: ServerResponse,
  approvals: Map<string, ApprovalTarget>,
): Promise<void> {
  const body = await readJsonBody(req);
  const approvalId =
    body && typeof body === 'object' && typeof (body as { approvalId?: unknown }).approvalId === 'string'
      ? (body as { approvalId: string }).approvalId
      : null;
  const runId =
    body && typeof body === 'object' && typeof (body as { runId?: unknown }).runId === 'string'
      ? (body as { runId: string }).runId
      : null;
  const approved =
    body && typeof body === 'object' ? (body as { approved?: unknown }).approved === true : false;
  if (!approvalId || !runId) {
    writeJson(res, 400, { error: { code: 'network' } });
    return;
  }
  // 承認相関 ID は run 単位で名前空間化し、並列 run 間の混線を防ぐ
  const key = `${runId}:${approvalId}`;
  const target = approvals.get(key);
  if (!target || !target.client.resolveApproval(approvalId, approved)) {
    approvals.delete(key);
    writeJson(res, 404, { error: { code: 'server' } });
    return;
  }
  writeJson(res, 200, { ok: true, approvalId, approved });
}

async function handlePrompt(
  req: IncomingMessage,
  res: ServerResponse,
  config: AgentConfig,
  registry: RunRegistry,
  approvals: Map<string, ApprovalTarget>,
  onLog: (message: string) => void,
): Promise<void> {
  const body = await readJsonBody(req);
  const message =
    body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
      ? ((body as { message: string }).message.trim() || null)
      : null;
  if (!message) {
    writeJson(res, 400, { error: { code: 'network' } });
    return;
  }

  // 承認レベルは実行単位に pi プロセス env へ注入する。不正値は無視（既定 dangerous-only）。
  const bodyRecord = body as Record<string, unknown>;
  const approvalLevel =
    bodyRecord.approvalLevel === 'auto' ||
    bodyRecord.approvalLevel === 'dangerous-only' ||
    bodyRecord.approvalLevel === 'always'
      ? (bodyRecord.approvalLevel as string)
      : undefined;
  const dangerousTools = Array.isArray(bodyRecord.dangerousTools)
    ? bodyRecord.dangerousTools
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && name.length <= 64)
        .slice(0, 50)
    : undefined;
  const runEnv: Record<string, string> = { ...config.pi.env };
  if (approvalLevel) runEnv.APPROVAL_LEVEL = approvalLevel;
  if (dangerousTools && dangerousTools.length > 0) {
    runEnv.APPROVAL_DANGEROUS_TOOLS = dangerousTools.join(',');
  }

  const runId = randomUUID();
  registry.create(runId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Run-Id': runId,
  });
  // クライアント切断時に uncaught になるのを防ぐ
  res.on('error', () => undefined);

  // 承認待ち等の無音期間にプロキシが切断しないよう heartbeat を送る
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, config.gateway.heartbeatMs);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  const client = new PiClient({ ...config.pi, env: runEnv });
  onLog(`[gateway] prompt started (len=${message.length}, run=${runId})`);

  let disconnected = false;

  client.onExtensionUiRequest = (request) => {
    // confirm 専用（レビュー F5 の結論）。select/input/editor は
    // PiClient が即時キャンセル応答するため SSE 中継・登録しない。
    if (request.method !== 'confirm') {
      onLog(`[gateway] ignoring non-confirm ui request: ${request.method}`);
      return;
    }
    registry.approvalPending(runId, {
      id: request.id,
      method: request.method,
      title: request.title,
      message: request.message,
    });
    approvals.set(`${runId}:${request.id}`, { client, runId });
    if (!disconnected && !res.writableEnded) {
      sse(res, {
        approvalRequest: {
          id: request.id,
          runId,
          method: request.method,
          title: request.title,
          message: request.message,
        },
      });
    }
  };

  client.onApprovalResolved = ({ id, expired, cancelled }) => {
    approvals.delete(`${runId}:${id}`);
    registry.approvalSettled(runId, id, cancelled ? 'cancelled' : expired ? 'expired' : 'resolved');
    if (expired && !disconnected && !res.writableEnded) {
      sse(res, { approvalRequest: { id, runId, expired: true } });
    }
  };

  const runPromise = (async () => {
    await client.start();
    return client.runPrompt(message, {
      timeoutMs: config.pi.promptTimeoutMs,
      onEvent: (event) => {
        // pi イベントを既存 SSE 契約へ正規化してから格納・中継する（RG-1 F1）
        for (const payload of normalizePiEventForSSE(event)) {
          const type = (payload as { type?: unknown }).type;
          // parse_error は pi の生行を含むため型のみにする（安全コード契約）
          const stored = type === 'parse_error' ? { type: 'parse_error' } : payload;
          registry.appendEvent(runId, stored as Parameters<RunRegistry['appendEvent']>[1]);
          if (type === 'parse_error') {
            onLog('[gateway] parse_error from pi (line suppressed)');
          }
          sse(res, stored);
        }
      },
    });
  })();

  runPromise.then(
    (result) => {
      // 切断後に abort 経由で settled した場合は部分結果として interrupted 扱いにする
      registry.complete(runId, result.finalText, disconnected);
      if (!disconnected && !res.writableEnded) {
        sse(res, { done: true, runId, finalText: result.finalText });
        res.end();
      }
    },
    (error) => {
      const code = error instanceof AgentError ? error.code : 'server';
      registry.fail(runId, code);
      if (!disconnected && !res.writableEnded) {
        sse(res, { error: { code } });
        res.end();
      }
    },
  ).finally(() => {
    clearInterval(heartbeat);
    void client.terminate().catch(() => undefined);
  });

  // 応答完了前の接続断は graceful に abort し、部分結果をレジストリへ残す。
  // req ではなく res の 'close' を見る（req 'close' はリクエスト完了でも発火する）。
  res.on('close', () => {
    if (!res.writableEnded) {
      disconnected = true;
      onLog('[gateway] client disconnected, requesting pi abort');
      void client.requestStop().catch(() => undefined);
    }
  });

  // pi の settle/異常終了までハンドラーを生かす（run 自体のタイムアウトで有界）
  await runPromise.catch(() => undefined);
}
