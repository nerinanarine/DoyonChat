import { ModelInfo } from '../../types';

/**
 * カタログ（`GET /api/models` は bare ID）からモデルの表示名を解決する。
 * 実行モデルは gateway 実行契約の `opencode-go/<modelId>` 形式で保存・記録されるため、
 * 照合前に bare 抽出する（backend `normalizeAgentModel` と同じ正規化）。
 * カタログ外は渡された ID をそのまま、未指定は 'AI' を返す。
 */
export function modelDisplayName(models: ModelInfo[], modelId?: string): string {
  if (!modelId) return 'AI';
  const slash = modelId.indexOf('/');
  const bare = slash === -1 ? modelId : modelId.slice(slash + 1);
  return models.find((model) => model.id === bare)?.name || modelId;
}
