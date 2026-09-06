import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { isModelAllowed, parseModelRef, parseScopeEnv } from './models';

export interface ToolsAllowlist {
  /** 有効化するツール名。空は全無効（`--no-tools` のまま）。 */
  tools: string[];
  /** `dangerous-only` で確認を求めるツール名。 */
  dangerous: string[];
}

const MAX_TOOL_NAME_LENGTH = 64;
const MAX_TOOL_ENTRIES = 100;

function sanitizeToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= MAX_TOOL_NAME_LENGTH)
    .slice(0, MAX_TOOL_ENTRIES);
}

/**
 * allowlist ファイルを読む。存在しない場合は既定（全無効・空分類）。
 * 壊れた JSON は fail-closed で起動させない。
 */
export function loadToolsAllowlist(filePath: string): ToolsAllowlist {
  let document: unknown = {};
  try {
    document = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { tools: [], dangerous: [] };
    }
    throw new Error(`Invalid tools allowlist file: ${filePath}`);
  }
  const record = (document && typeof document === 'object' ? document : {}) as Record<
    string,
    unknown
  >;
  return {
    tools: sanitizeToolNames(record.tools),
    dangerous: sanitizeToolNames(record.dangerous),
  };
}

export interface PiOptions {
  /** pi 実行方法。`piBin` が .js ファイルなら node で起動、それ以外はコマンドとして起動する。 */
  piBin: string;
  /** pi 追加引数。既定は `--mode rpc --no-session --no-tools`（D3: ツール全無効）に承認ゲート拡張を付加。 */
  piArgs: string[];
  /** 1プロンプトあたりの最大実行時間（ms）。超過時はタイムアウト＋プロセス回収。 */
  promptTimeoutMs: number;
  /** 承認ダイアログの応答待ち上限（ms）。超過時は拒否（cancelled）扱いで自動解決する。省略時は 120_000。 */
  approvalTimeoutMs?: number;
  /** 子プロセスへ渡す追加環境変数（process.env に上書きマージ）。実行単位の設定注入用。 */
  env?: Record<string, string>;
}

export interface GatewayOptions {
  /** 無音期間の SSE heartbeat 間隔（ms）。承認待ち等の切断防止用。 */
  heartbeatMs: number;
  /** 実行レコードの保持期間（ms）。再購読・最終回答回収用。 */
  runTtlMs: number;
  /** 実行レコードの最大件数。超過時は古いものから破棄する。 */
  registryMax: number;
  /** 同時実行数上限。超過時は 429 rate_limit で拒否する。 */
  maxRuns: number;
  /** モデルスコープパターン（`provider/id` または bare id のグロブ）。空は全許可。 */
  modelScope: string[];
  /** 既定モデル（`provider/id`）。リクエスト未指定時に switch 後に pin する。空は pin しない。 */
  defaultModel?: string;
  /** allowlist 由来の危険ツール表（`dangerous-only` の既定。リクエスト上書き可）。 */
  toolsDangerous: string[];
  /** allowlist 由来の有効ツール名（空は全無効）。pi-subagents 登録要否の判定に使う。 */
  tools: string[];
  /** 実行データディレクトリ（セッション・per-user 設定）。既定 `./data`。 */
  dataDir: string;
}

/** 環境変数の数値パース。非数値・無限大はフォールバックに倒す。 */
function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface AgentConfig {
  host: string;
  port: number;
  pi: PiOptions;
  gateway: GatewayOptions;
}

const DEFAULT_PI_ARGS = ['--mode', 'rpc', '--no-session', '--no-tools'];

/**
 * 承認ゲート拡張の既定パス。dist 稼働時は .js、ts-jest 等の src 稼働時は .ts を使う
 * （pi のローダーは TS を直接読める）。いずれも無い場合は fail-closed で起動させない。
 */
function defaultExtensionCandidate(): string | null {
  const js = path.join(__dirname, 'extensions', 'approvalGate.js');
  if (existsSync(js)) return js;
  const ts = path.join(__dirname, 'extensions', 'approvalGate.ts');
  if (existsSync(ts)) return ts;
  return null;
}

/**
 * AGENT_EXTENSIONS が設定されたら既定を置換する（空文字は拡張なし）。
 * 既定パスの実体が無い場合は fail-closed で起動させない（ゲートなし実行の防止）。
 */
function resolveExtensionPaths(env: NodeJS.ProcessEnv): string[] {
  const raw = env.AGENT_EXTENSIONS;
  if (raw !== undefined) {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  const candidate = defaultExtensionCandidate();
  if (!candidate) {
    throw new Error(
      `Agent approval gate extension missing: ${candidate}. ` +
        'Refusing to start without tool-call gating (build first or set AGENT_EXTENSIONS).',
    );
  }
  return [candidate];
}

/**
 * Windows で `pi` が npm シェルシム（.sh/.cmd）の場合に Node の `spawn` では起動できないため、
 * グローバルインストール先の JS エントリ（dist/bundle/cli.js）を解決して node で起動する。
 */
function resolvePiEntry(piBin: string): string {
  if (process.platform === 'win32' && piBin === 'pi') {
    // Windows では npm は .cmd シムのため shell 経由で実行する
    const npmRoot = spawnSync('npm root -g', {
      encoding: 'utf8',
      shell: true,
    }).stdout
      ?.trim();
    if (npmRoot) {
      const candidate = path.join(
        npmRoot,
        '@earendil-works',
        'pi-coding-agent',
        'dist',
        'bundle',
        'cli.js',
      );
      if (existsSync(candidate)) return candidate;
    }
  }
  return piBin;
}

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const piBin = env.PI_BIN || 'pi';
  const entry = resolvePiEntry(piBin);
  const useNode = entry.endsWith('.js') && existsSync(entry);
  const modelScope = parseScopeEnv(env.AGENT_MODEL_SCOPE);
  const defaultModel = env.AGENT_DEFAULT_MODEL || undefined;
  // 既定モデルは起動時に検証する（fail fast。セッション復元時の pin に使うため）。
  if (defaultModel !== undefined) {
    const ref = parseModelRef(defaultModel);
    if (!ref || !isModelAllowed(ref.provider, ref.modelId, modelScope)) {
      throw new Error(`Invalid AGENT_DEFAULT_MODEL: ${defaultModel}`);
    }
  }
  const baseArgs = useNode ? [entry, ...DEFAULT_PI_ARGS] : [...DEFAULT_PI_ARGS];
  const allowlist = loadToolsAllowlist(
    env.AGENT_TOOLS_FILE || path.join(__dirname, '..', 'tools.allowlist.json'),
  );
  const piArgs = [
    ...baseArgs,
    ...(allowlist.tools.length > 0 ? ['--tools', allowlist.tools.join(',')] : []),
    ...resolveExtensionPaths(env).flatMap((ext) => ['--extension', ext]),
  ];

  return {
    // 既定は loopback のみ。コンテナ公開時は GATEWAY_HOST=0.0.0.0 を明示する（Phase 3 で認証追加まで）。
    host: env.GATEWAY_HOST || '127.0.0.1',
    port: num(env.GATEWAY_PORT, 8787),
    pi: {
      piBin: useNode ? process.execPath : entry,
      piArgs,
      promptTimeoutMs: num(env.AGENT_PROMPT_TIMEOUT_MS, 180_000),
      approvalTimeoutMs: num(env.AGENT_APPROVAL_TIMEOUT_MS, 120_000),
      env: undefined,
    },
    gateway: {
      heartbeatMs: num(env.GATEWAY_HEARTBEAT_MS, 15_000),
      runTtlMs: num(env.GATEWAY_RUN_TTL_MS, 600_000),
      registryMax: num(env.GATEWAY_REGISTRY_MAX, 200),
      maxRuns: num(env.GATEWAY_MAX_RUNS, 4),
      modelScope,
      defaultModel: env.AGENT_DEFAULT_MODEL || undefined,
      toolsDangerous: allowlist.dangerous,
      tools: allowlist.tools,
      dataDir: env.AGENT_DATA_DIR || './data',
    },
  };
}