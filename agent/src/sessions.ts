import fs from 'node:fs';
import path from 'node:path';

/**
 * 会話↔pi セッション対応付けの資産管理（P3-010 Phase 2・方式A）。
 * - セッションファイル: `<dataDir>/sessions/{userId}/{conversationId}.jsonl`
 * - per-user 設定: `<dataDir>/users/{userId}/config/settings.json`
 *   （`subagents.defaultModel`・`packages` を書き込む。PI_CODING_AGENT_DIR で参照）
 * ID はパストラバーサル防止のため英数・`_`・`-` のみ許容する。
 */

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function assertSafeId(name: string, value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new Error(`invalid ${name}`);
  }
  return value;
}

export function sessionFilePath(dataDir: string, userId: string, conversationId: string): string {
  assertSafeId('userId', userId);
  assertSafeId('conversationId', conversationId);
  return path.join(dataDir, 'sessions', userId, `${conversationId}.jsonl`);
}

export function userConfigDir(dataDir: string, userId: string): string {
  assertSafeId('userId', userId);
  return path.join(dataDir, 'users', userId, 'config');
}

export interface UserAgentSettings {
  subagentModel?: string;
}

/**
 * per-user 設定を読み、エージェント関連キーをマージして書き戻す。
 * 既存キー（auth 等）は保持する。subagentModel 未指定時は defaultModel に触れない。
 * pi-subagents の packages 登録はツール有効時のみ行う。無効時（既定）に登録すると
 * pi が初回起動で npm インストール（数千ファイル・数分）を実行し初回 latency が悪化するため。
 */
export function writeUserAgentSettings(
  dataDir: string,
  userId: string,
  settings: UserAgentSettings,
  includePackages = false,
): string {
  const dir = userConfigDir(dataDir, userId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'settings.json');
  let document: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      document = parsed as Record<string, unknown>;
    }
  } catch {
    // 存在しない・壊れている場合は作り直す
  }
  if (settings.subagentModel !== undefined) {
    const subagents =
      document.subagents && typeof document.subagents === 'object' && !Array.isArray(document.subagents)
        ? { ...(document.subagents as Record<string, unknown>) }
        : {};
    if (settings.subagentModel) {
      subagents.defaultModel = settings.subagentModel;
    } else {
      delete subagents.defaultModel;
    }
    document.subagents = subagents;
  }
  const packages = Array.isArray(document.packages)
    ? [...document.packages]
    : [];
  // packages は宣言的に同期する。無効時に残すと pi が毎起動 npm インストールを試みる。
  const pkgIndex = packages.indexOf('npm:pi-subagents');
  if (includePackages && pkgIndex === -1) packages.push('npm:pi-subagents');
  if (!includePackages && pkgIndex !== -1) packages.splice(pkgIndex, 1);
  document.packages = packages;
  // 原子書込（temp+rename）。中断時の半端ファイルで既存設定を壊さない。
  const tmpFile = `${file}.tmp-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  fs.writeFileSync(tmpFile, `${JSON.stringify(document, null, 2)}\n`);
  fs.renameSync(tmpFile, file);
  return dir;
}

/** 会話削除時のセッション破棄。存在しなくても成功扱い。 */
export function deleteSessionFile(dataDir: string, userId: string, conversationId: string): boolean {
  const file = sessionFilePath(dataDir, userId, conversationId);
  try {
    fs.unlinkSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}
