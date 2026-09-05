/**
 * エージェント用モデルカタログのスコープ解決（P3-010 Phase 2）。
 * pi の `get_available_models` は `--models` スコープを反映しないため、
 * gateway 側でパターンマッチ（minimatch 流儀の最小実装）して絞る。
 * パターンは `provider/modelId` または bare `modelId` に対する `*`/`?` グロブ。
 */

export interface CatalogModel {
  id: string;
  provider?: string;
  name?: string;
}

function globToRegExp(pattern: string): RegExp {
  let source = '^';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

export function fullModelId(model: CatalogModel): string {
  return model.provider ? `${model.provider}/${model.id}` : model.id;
}

/** 単一パターンがモデルに一致するか。`/` 含みは provider/id 照合、bare は id 照合。 */
export function matchModelPattern(pattern: string, model: CatalogModel): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return false;
  const regex = globToRegExp(trimmed);
  if (trimmed.includes('/')) return regex.test(fullModelId(model));
  return regex.test(model.id);
}

/** スコープパターンでカタログを絞る。空スコープは全許可。 */
export function filterModelsByScope(models: CatalogModel[], scope: string[]): CatalogModel[] {
  const patterns = scope.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
  if (patterns.length === 0) return [...models];
  return models.filter((model) => patterns.some((pattern) => matchModelPattern(pattern, model)));
}

/** `provider/id` 形式のモデル参照を分解する。不正形は null。 */
export function parseModelRef(ref: unknown): { provider: string; modelId: string } | null {
  if (typeof ref !== 'string') return null;
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1) return null;
  const provider = ref.slice(0, slash).trim();
  const modelId = ref.slice(slash + 1).trim();
  if (!provider || !modelId) return null;
  return { provider, modelId };
}

/** スコープ内かを判定する。空スコープは全許可。 */
export function isModelAllowed(
  provider: string,
  modelId: string,
  scope: string[],
): boolean {
  const patterns = scope.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
  if (patterns.length === 0) return true;
  return filterModelsByScope([{ id: modelId, provider }], patterns).length > 0;
}

/** AGENT_MODEL_SCOPE（カンマ区切り）を配列化する。 */
export function parseScopeEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
}
