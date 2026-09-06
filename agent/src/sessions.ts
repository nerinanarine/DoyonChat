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
  /** pi-web-access の index パス。researcher(child-only)への配線に使う。未指定/空は配線なし。 */
  webAccessIndex?: string;
}

/**
 * researcher 子エージェントへ追加する Web 系ツール（P3-014 FR-3）。
 * dangerous 分類なし（読み取り専用・承認確認なし）。
 */
export const RESEARCHER_WEB_TOOLS = ['web_search', 'fetch_content'] as const;

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
  // subagents は一度だけ引き出し、subagentModel と researcher 配線の両方に使う。
  const subagents =
    document.subagents && typeof document.subagents === 'object' && !Array.isArray(document.subagents)
      ? { ...(document.subagents as Record<string, unknown>) }
      : {};
  if (settings.subagentModel !== undefined) {
    if (settings.subagentModel) {
      subagents.defaultModel = settings.subagentModel;
    } else {
      delete subagents.defaultModel;
    }
  }
  // P3-014: researcher 配線は宣言的に同期する（未指定時は残留配線を削除）。
  syncResearcherWebAccess(subagents, settings.webAccessIndex ?? '', includePackages);
  if (Object.keys(subagents).length > 0) {
    document.subagents = subagents;
  } else {
    // 管理対象が空になった場合は古い値が残らないよう削除する（P3-014 残留配線の防止）
    delete document.subagents;
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

/**
 * pi-subagents の per-user 拡張設定を書く（P3-014 FR-1）。
 * `extensions/subagent/config.json` に `{"asyncByDefault": false}` を設定し、
 * 子を foreground 化して gateway の run ライフサイクル（prompt→settle→終了）に収める。
 * 既存キーは保持し、原子書込（temp+rename）する。既存設定を返す。
 */
export function writeSubagentExtensionConfig(
  dataDir: string,
  userId: string,
): string {
  const dir = path.join(userConfigDir(dataDir, userId), 'extensions', 'subagent');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'config.json');
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
  document.asyncByDefault = false;
  const tmpFile = `${file}.tmp-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  fs.writeFileSync(tmpFile, `${JSON.stringify(document, null, 2)}\n`);
  fs.renameSync(tmpFile, file);
  return file;
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

/**
 * researcher への pi-web-access 配線を宣言的に同期する（P3-014 FR-2/FR-3）。
 * 拡張ツールは子エージェントの allowlist に provider パスを明示しないと載らない
 * （Phase 0 §3 の実機診断）。subagents.agentOverrides.researcher に
 * subagentOnlyExtensions（child-only）＋ tools（既存+Web ツールをマージ）を書く。
 * pi-subagents が無効（includePackages=false）または配線指定なしの場合は
 * 管理する researcher override を削除する（残留配線の防止）。
 */
function syncResearcherWebAccess(
  subagents: Record<string, unknown>,
  webAccessIndex: string,
  includePackages: boolean,
): void {
  const subagentsEnabled = includePackages && webAccessIndex.length > 0;
  const hasOverrides =
    subagents.agentOverrides &&
    typeof subagents.agentOverrides === 'object' &&
    !Array.isArray(subagents.agentOverrides);
  if (!subagentsEnabled) {
    if (hasOverrides) {
      const overrides = { ...(subagents.agentOverrides as Record<string, unknown>) };
      delete overrides.researcher;
      if (Object.keys(overrides).length === 0) delete subagents.agentOverrides;
      else subagents.agentOverrides = overrides;
    }
    return;
  }
  const overrides = hasOverrides
    ? { ...(subagents.agentOverrides as Record<string, unknown>) }
    : {};
  const researcher =
    overrides.researcher &&
    typeof overrides.researcher === 'object' &&
    !Array.isArray(overrides.researcher)
      ? { ...(overrides.researcher as Record<string, unknown>) }
      : {};
  const existingTools = Array.isArray(researcher.tools)
    ? researcher.tools.filter((tool): tool is string => typeof tool === 'string')
    : [];
  researcher.subagentOnlyExtensions = [webAccessIndex];
  researcher.tools = [...new Set([...existingTools, ...RESEARCHER_WEB_TOOLS])];
  overrides.researcher = researcher;
  subagents.agentOverrides = overrides;
}
