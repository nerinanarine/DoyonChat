import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AgentConfig } from './config';
import { AgentError } from './errors';
import { PiClient } from './piClient';
import { RunRegistry } from './registry';
import { normalizePiEventForSSE } from './normalize';
import { CatalogModel, filterModelsByScope, isModelAllowed, parseModelRef } from './models';
import {
  assertSafeId,
  deleteSessionFile,
  sessionFilePath,
  userConfigDir,
  writeUserAgentSettings,
} from './sessions';

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

const MODELS_CACHE_TTL_MS = 3_600_000;

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
  const modelStore: { cache: { at: number; models: CatalogModel[] } | null } = { cache: null };
  const server = createServer((req, res) => {
    void handleRequest(req, res, config, registry, approvals, limiter, modelStore, onLog);
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
  modelStore: { cache: { at: number; models: CatalogModel[] } | null },
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

    if (req.method === 'GET' && url.pathname === '/models') {
      await handleModels(res, config, modelStore);
      return;
    }

    if (req.method === 'DELETE' && url.pathname === '/sessions') {
      await handleDeleteSession(req, res, config);
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

async function handleModels(
  res: ServerResponse,
  config: AgentConfig,
  modelStore: { cache: { at: number; models: CatalogModel[] } | null },
): Promise<void> {
  try {
    const now = Date.now();
    if (!modelStore.cache || now - modelStore.cache.at > MODELS_CACHE_TTL_MS) {
      modelStore.cache = { at: now, models: await fetchModelCatalog(config) };
    }
    writeJson(res, 200, {
      models: filterModelsByScope(modelStore.cache.models, config.gateway.modelScope),
    });
  } catch (error) {
    const code = error instanceof AgentError ? error.code : 'server';
    writeJson(res, 500, { error: { code } });
  }
}

/** pi から全カタログを取得する（短命クライアント。スコープ絞りは呼び出し側）。 */
async function fetchModelCatalog(config: AgentConfig): Promise<CatalogModel[]> {
  const client = new PiClient(config.pi);
  try {
    await client.start();
    const response = await client.command<{
      type: string;
      data?: { models?: CatalogModel[] };
    }>({ type: 'get_available_models' }, 30_000);
    const models = response.data?.models;
    if (!Array.isArray(models)) return [];
    return models.filter(
      (model): model is CatalogModel =>
        !!model && typeof model === 'object' && typeof (model as CatalogModel).id === 'string',
    );
  } finally {
    await client.terminate().catch(() => undefined);
  }
}

async function handleDeleteSession(
  req: IncomingMessage,
  res: ServerResponse,
  config: AgentConfig,
): Promise<void> {
  const body = await readJsonBody(req);
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  try {
    const userId = assertSafeId('userId', record.userId);
    const conversationId = assertSafeId('conversationId', record.conversationId);
    deleteSessionFile(config.gateway.dataDir, userId, conversationId);
    writeJson(res, 200, { ok: true });
  } catch {
    writeJson(res, 400, { error: { code: 'network' } });
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
  // dangerous 表の優先順位: リクエスト指定 > allowlist 既定 > ゲート内蔵既定
  const dangerousDefault =
    dangerousTools && dangerousTools.length > 0
      ? dangerousTools
      : config.gateway.toolsDangerous;
  if (dangerousDefault.length > 0) {
    runEnv.APPROVAL_DANGEROUS_TOOLS = dangerousDefault.join(',');
  }

  // 実行モデルは `provider/id` 形式で受け、スコープ内のみ許可する
  const modelRef = bodyRecord.model !== undefined ? parseModelRef(bodyRecord.model) : undefined;
  if (bodyRecord.model !== undefined && !modelRef) {
    writeJson(res, 400, { error: { code: 'network' } });
    return;
  }
  if (modelRef && !isModelAllowed(modelRef.provider, modelRef.modelId, config.gateway.modelScope)) {
    writeJson(res, 400, { error: { code: 'network' } });
    return;
  }

  // 会話対応（任意）。userId と conversationId は組で指定し、パストラバーサル防止のため検証する。
  const hasUser = bodyRecord.userId !== undefined;
  const hasConversation = bodyRecord.conversationId !== undefined;
  if (hasUser !== hasConversation) {
    writeJson(res, 400, { error: { code: 'network' } });
    return;
  }
  const subagentModelRaw =
    typeof bodyRecord.subagentModel === 'string' && bodyRecord.subagentModel.trim()
      ? bodyRecord.subagentModel.trim()
      : undefined;
  // subagentModel も model と同一の検証を適用する（スコープ迂回の防止）。正規形で保存する。
  let subagentModel: string | undefined;
  if (subagentModelRaw !== undefined) {
    const subagentRef = parseModelRef(subagentModelRaw);
    if (
      !subagentRef ||
      !isModelAllowed(subagentRef.provider, subagentRef.modelId, config.gateway.modelScope)
    ) {
      writeJson(res, 400, { error: { code: 'network' } });
      return;
    }
    subagentModel = `${subagentRef.provider}/${subagentRef.modelId}`;
  }
  let sessionPath: string | undefined;
  let conversationId: string | undefined;
  if (hasUser && hasConversation) {
    try {
      const safeUserId = assertSafeId('userId', bodyRecord.userId);
      const safeConversationId = assertSafeId('conversationId', bodyRecord.conversationId);
      conversationId = safeConversationId;
      sessionPath = sessionFilePath(config.gateway.dataDir, safeUserId, safeConversationId);
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      // per-user 設定は毎回マージ書込する（packages 保証のため。既存キーは保持される）。
      writeUserAgentSettings(
        config.gateway.dataDir,
        safeUserId,
        subagentModel !== undefined ? { subagentModel } : {},
      );
      runEnv.PI_CODING_AGENT_DIR = userConfigDir(config.gateway.dataDir, safeUserId);
    } catch {
      writeJson(res, 400, { error: { code: 'network' } });
      return;
    }
  }

  // 同一会話の実行中 run があれば 429（replica=1 前提のインメモリ判定）。
  // SSE ヘッダ送出前に返すため、クライアントは JSON の rate_limit を受ける。
  if (conversationId && registry.hasActiveRunForConversation(conversationId)) {
    writeJson(res, 429, { error: { code: 'rate_limit' } });
    return;
  }

  const runId = randomUUID();
  registry.create(runId, conversationId);

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
    if (sessionPath) {
      await client.switchSession(sessionPath);
    }
    if (modelRef) {
      // set_model 自体はスコープ非チェックのため gateway で事前検証済み。失敗は server 扱い。
      await client.command({ type: 'set_model', provider: modelRef.provider, modelId: modelRef.modelId }, 30_000);
    }
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
