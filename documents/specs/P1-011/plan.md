# P1-011 Plan: 長文推論時のエラー修正

## Summary

DeepSeek V4 Flash で推論9000字超がエラーになる根本原因を Phase 0 で確定（最有力: `max_tokens=4096` 不足 + `finish_reason:length` 未対応）し、 Functions の `opencodeGo.ts` / `chat.ts` を中心に修正する。推論は保存しつつ、上限ガードで肥大化を防ぐ。

## Phase 0: 原因再現（ゲート）

**目的**: H1 を再現テストで確定する

**作業**:
- 再現は `functions/tests/unit/opencodeGo.test.ts` の `streamingResponse`（`global.fetch` / SSE行モック）パターンで行う。`sse.test.ts` は `jest.spyOn(opencodeGo, 'streamChat')` をモックするため SSE行レベルの `finish_reason` 挙動を検証できない（循環テストになる）
  - 推論 12k字（`'a'.repeat(12000)`を複数 delta に分割した SSE 行）で `streamChat` を呼び、現行コードが `UpstreamError: stream ended before completion marker` で失敗することを確認
  - `finish_reason: 'length'` を含む最終 SSE 行について、(a) `[DONE]` 有無、(b) `{"error":...}` 返却の有無を観測。OpenAI互換は通常 `length` 後に `[DONE]` を送るため、現行で失敗するのは `[DONE]` が欠落するケースに限る点を検証し、spec の断定を「未検証仮説」に留める
- 上流の `usage` が取得できる場合はログ（本文は出さず `reasoning_length` のみ）で H1 補強
- 結果を `spec.md Investigation` に追記し、H1 が真なら Phase 1 へ、偽なら H2（SSE行境界）へ pivot

**検証**:
```bash
cd functions && npm run build:check
npx jest tests/unit/opencodeGo.test.ts --runInBand
# 必要に応じ sse.test.ts は global.fetch モック経由で実 streamChat を通す場合のみ併用
```

## Phase 1: 設計確定

**決定事項**:
- **D1 maxTokens**: 既定 `4096` → 引き上げ（暫定 8192 だが、Issueの9000字が日本語なら 9000+ tokens となり 8192 でも再発するため、Phase 0 の `usage` 実測または DeepSeek V4 Flash の出力上限カタログ値を根拠に固定。候補: 12000/16000）。モデル別既定は `functions/src/config/modelCatalog.ts` にフィールド追加し `createRequest` はカタログ参照（opencodeGo.ts 直書きの二重化を避ける）。環境変数 `OPENCODE_GO_MAX_TOKENS` で上書き可能にするかは本Phaseで決定し spec Open Questions に反映
- **D2 finish_reason**: `parseChatCompletionsSSELine` で `finish_reason === 'length'` を `completed` として扱う（`finish_reason` は最終 delta と同行し得るため delta 抽出と独立に判定）。Messages/Responses も同様に `stop_reason/max_tokens` / `incomplete` を completed 扱いに拡張（ただし Messages は `message_stop` で必ず完了するため実質 no-op の可能性を認識）
- **D3 推論上限ガード**: `REASONING_MAX_CODEPOINTS = 50000`（暫定）を `chat.ts` に定数化。`fullReasoning` が超過したら超過分を切り捨て `…(truncated)` を付与（累積時截断は以後 delta 破棄のフラグ管理を要するため、finalize 直前ガードのみで FR-006 を満たせるか Phase 1 で再確認。二重ガードは必要な場合のみ採用）。`content` は截断しない
- **D4 SSE行境界**: 現行の `buffer.split('\n')` で十分か、9KB行の跨ぎをテストで確認。不足があれば `decoder` の `stream:true` 維持と `buffer` 残存処理を強化（現行で足りる見込み）

**成果物**: 本 plan の D1–D4 を確定し、spec.md の FR-003/004/006 の数値を固定

## Phase 2: 実装

**対象ファイル**:
- `functions/src/config/modelCatalog.ts`
  - モデル別 `maxTokens` フィールド追加（D1）
- `functions/src/services/opencodeGo.ts`
  - `createRequest` の `maxTokens` 既定値引き上げとカタログ参照
  - `parseChatCompletionsSSELine` / `parseMessagesSSELine` / `parseResponsesSSELine` の `length` / `max_tokens` / `incomplete` 対応（finish_reason は delta と同行し得る点に注意）
  - `normalizeProtocolStream` の `throw 'stream ended before completion marker'` を、上記 completed 扱い後は throw しないよう修正
- `functions/src/functions/chat.ts`
  - `REASONING_MAX_CODEPOINTS` 定数と截断ロジック（`fullReasoning` 累積時と `finalizeAssistant` 直前の両方でガード）
  - `TTFT` ログに `reasoning_length` を併記（任意）
- `frontend/src/hooks/useChat.ts`（必要なら）
  - 長文時の `setStreamingReasoning` 高頻度更新を `requestAnimationFrame` バッチは見送り、まずは Functions 側で解決。回帰が見られれば Phase 3 で対応
- `functions/tests/integration/sse.test.ts` / `functions/tests/unit/opencodeGo.test.ts`
  - Phase 0 再現テストを成功ケースへ転換、截断テスト追加

**非対象**: カタログ変更、認証、PWA

## Phase 3: テスト

**自動テスト**:
```bash
cd functions && npm run build:check && npm test -- --runInBand
cd frontend && npm test -- --run && npm run build
```
- 9000字超推論モックで正常完了・保存検証
- `finish_reason:length` モックで正常完了検証
- 60k字推論モックで 50k+truncated 収まり検証
- 既存 140/99 件の回帰なし

**手動/任意 live**:
```bash
cd functions && npm run test:live:models  # 既存 26モデル疎通（任意）
# DeepSeek V4 Flash で長文推論プロンプトを2回実行しエラーなしを確認（本番前）
```

## Phase 4: ドキュメント/検証

- `specs/000_backlog/items/P1-011-long-reasoning-error.md` に実装メモと検証結果を追記
- `specs/000_backlog/backlog.md` の P1-011 を🟢へ更新（本番デプロイまで管理済み扱いなら本Phaseで更新）
- `README.md` の未対応リストから P1-011 を除外（必要なら）

## Risks & Mitigations

- **R1 maxTokens引き上げでコスト/遅延増**: モデル別既定に留め、8192で様子見。環境変数で即時戻せるようにする
- **R2 上流が `length` 以外の停止理由を返す**: `tool_calls` / `content_filter` は従来どおり completed ではなく継続。`length`/`max_tokens` のみに限定して completed 扱い
- **R3 推論截断で情報欠損**: 末尾に `(truncated)` を明示し、ログで `original_length` を残す

## Rollback

- `opencodeGo.ts` の maxTokens / finish_reason 分岐を revert すれば即時復旧可能。推論ガードは定数 `REASONING_MAX_CODEPOINTS` を `Infinity` に戻すことで無効化できる

## Verification Commands

```bash
cd functions && npm run build:check
npx jest tests/integration/sse.test.ts tests/unit/opencodeGo.test.ts --runInBand
cd frontend && npm test -- --run
git diff --check
```

## Implementation Order

Phase 0（再現）→ Phase 1（D1–D4確定）→ Phase 2（opencodeGo.ts → chat.ts → tests）→ Phase 3（自動テスト）→ Phase 4（ドキュメント）
