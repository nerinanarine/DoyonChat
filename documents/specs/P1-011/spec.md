# P1-011: 長文推論時のエラー修正

## Status

Implemented（Phase 0 確定・実装完了・レビュー済み）

## Background

GitHub Issue #20「推論が9000字を超えると、エラーが発生する。」が DeepSeek V4 Flash 利用時に2回発生している。現行のストリーミング実装は推論（reasoning）を含めて正常完了する前提だが、長文推論でだけエラー表示に遷移し、回答が保存されない。

関連バックログ: [P1-011](../../000_backlog/items/P1-011-long-reasoning-error.md)
関連Issue: [#20](https://github.com/nerinanarine/DoyonChat/issues/20)

## Goal

- DeepSeek V4 Flash で推論が9000字（codepoints）を超える応答でも、エラーにならずストリームが正常完了し、content / reasoning が保存されること
- 短い推論・推論なしの既存動作を壊さないこと

## Non-Goal

- 推論の要約・圧縮・AIによる自動截断（本件ではエラー回避が目的。UX改善の要約は別バックログで検討）
- モデルカタログの変更、既定モデル変更
- PWA / 認証 / CosmosDB スキーマ変更

## Definitions

- **推論**: `reasoning` / `reasoning_content` / `thinking` 等として上流が返す思考過程。`opencodeGo.ts: extractReasoningText` および `reasoningNormalizer.ts: ReasoningMarkupParser` で正規化される
- **長文推論**: `Array.from(reasoning).length > 9000` となる推論
- **エラー**: 現行で `UpstreamError('server')` として SSE error event に変換され、Frontend で「サーバーエラー」等の SafeErrorCode 表示に至るケース

## Investigation (Phase 0 確定結果)

### Phase 0 観測結果（2026-09-01）

- `tests/unit/opencodeGo.test.ts` に `global.fetch` + SSE行モックで再現: 12k字推論を3つの `reasoning_content` delta + `[DONE]` で正常完了、9000字超でも `UpstreamError` にならないことを確認。`finish_reason:length` の最終行（`delta: content+finish_reason:length` および `delta:{}+finish_reason:length`）で `[DONE]` なしでも `delta_then_completed` で正常完了することを確認。従って H1 は「`max_tokens` 不足時に `length` で停止し `[DONE]` が欠落するケースでエラー化」として確定
- 上流の `usage` 実測はモックでは未観測だが、DeepSeek 系は `maxTokens:16384` へ引き上げで再発リスクを低減。日本語9000字は 9000〜18000 tokens になり得るため 16384 でも `length` 到達は残るが、FR-003 で正常完了扱いのためエラーにはならない
- H2/H3 は副次的で対応不要と判断

### 現行仕様の制約（Phase 0 前の仮説）

- `opencodeGo.ts: createRequest` の `maxTokens` 既定値は `4096`（`max_tokens` / `max_output_tokens`）。DeepSeek の推論トークンは出力トークンに含まれるため、推論だけで 3000–4500 tokens を消費し、回答と合わせて上限超過し得る
- `opencodeGo.ts: parseChatCompletionsSSELine` は `data: [DONE]` のみを `completed` として扱い、`choices[0].finish_reason === 'length'` を `completed` として扱っていない。`length` で停止し `[DONE]` が送られない場合、本実装は EOF まで読み進め `throw new UpstreamError('server', 'stream ended before completion marker')` に至る可能性がある（`normalizeProtocolStream`）。ただし上流が `length` 後に `[DONE]` を送る場合は現行でも正常完了するため、要 Phase 0 観測（未検証仮説）
- `chat.ts: createResponseStream` は上流エラーを `savePartialOnStop=false` で error event のみ送信し、アシスタントメッセージを保存しない。長文推論起因の `length` 停止が上記条件でエラー扱いされる場合、9000字超で失敗に見える可能性がある
- `chat.ts` の `fullReasoning` はメモリ上で無制限に連結される。9000字（27KB）自体は 2MB の CosmosDB 上限に届かないが、1ストリームで 50k+ 字に膨らむケースでは保存・描画コストが増大する

### 仮説の優先度

1. **H1（最有力）**: `max_tokens` 不足 + `finish_reason: length` 未対応 → 正常な長文生成がエラー扱い
2. **H2**: 極大 SSE 行（9KB/行）によるプロキシ/Fetch バッファ境界での `buffer.split('\n')` 取りこぼし（現行は `decoder.decode(value, {stream:true})` で対応済みだが、1行が Reader の `value` を跨ぐケースの検証が必要）
3. **H3**: Frontend の `accumulatedRef` での高頻度 `setState` が長文でフレーム落ちする（エラーではないが体感劣化）

Phase 0 では H1 を再現テストで確定させる。H1 が真なら H2/H3 は副次対応とする。

## Requirements

### FR-001: 長文推論でも正常完了する

- 推論が9000字を超えても、ストリームは `done:true` で正常終了し、エラー表示に遷移しないこと

### FR-002: 長文推論の保存

- `fullReasoning` が9000字超でも、`finalizeAssistant(content, reasoning)` で `REASONING_MAX_CODEPOINTS` 以内であれば推論が欠損なく保存されること（FR-006 の上限超過時は截断）。空でない `content` があれば `content` を優先し、`reasoning` は付随して保存されること

### FR-003: 上流 `length` 停止の正常扱い

- Chat Completions の `finish_reason === 'length'`、Responses の `response.incomplete` / `max_output_tokens` 超過、Messages の `stop_reason === 'max_tokens'` をエラーではなく「出力上限到達の正常完了」として扱うこと。少なくとも Chat Completions の `length` は必須対応

### FR-004: max_tokens の見直し

- 長文推論モデル（DeepSeek V4 Flash 等）で `length` 到達を避けるため、`maxTokens` 既定値を見直すこと。既定値引き上げとモデル別上書きのいずれかを採用し、最大でも CosmosDB 1ドキュメント 2MB と Frontend 描画を破綻させない範囲に収めること

### FR-005: エラー時の情報保全

- `length` 以外の真のエラー（`rate_limit` / `timeout` / `server`）は従来どおり `SafeErrorCode` で通知し、本文として保存しないこと（P2-003 準拠）

### FR-006: 推論の上限ガード（安全弁）

- 推論が極端に肥大化した場合でも、プロセスが OOM しないよう上限（例: 50k codepoints）で截断し、末尾に `…(truncated)` を付与して保存すること。上限値は定数化し、テストで検証可能にすること

### FR-007: 既存動作の非回帰

- 推論なし・短い推論（<1000字）・画像付き会話のストリーミングが従来どおり動作すること

## Non-Functional Requirements

- CosmosDB 1ドキュメント 2MB 以内に収まること（推論上限ガードで担保）
- 9000字推論のストリーム完了時間が、短文推論比で有意に劣化しないこと（TTFT 計測を維持）
- ログに APIキー / 推論・回答本文の全体を出力しないこと（P2-003 同様）

## Out of Scope

- 推論の自動要約、UI での仮想スクロール（P3-006）、推論の検索
- モデルごとの推論有効/無効トグル

## Verification

1. 再現テスト: `reasoning` が9000字超のモックストリームで `chatHandler` が `200` + 単一 `done:true` を返し、保存されたアシスタントメッセージの `reasoning` 長さが9000超であること
2. `finish_reason: length` のモックでエラーではなく正常完了すること
3. 上限ガードテスト: 60k字推論モックで保存時に 50k + `…(truncated)` に収まること
4. 既存テスト: `functions` 140件台 / `frontend` 99件が維持されること、通常の短文ストリームが回帰しないこと
5. 手動確認: DeepSeek V4 Flash で長文推論を誘発するプロンプト（例: 「9000字以上の思考過程を含めて段階的に解いて」）を2回実行し、エラーなく完了すること（本番デプロイ前の任意 live 確認）

## Open Questions

- DeepSeek の推論トークンが `max_tokens` に含まれる正確なカウント方式（Issue 再現時の上流 `usage` を取得できれば確定）— 日本語9000字で 9000〜18000 tokens の可能性あり
- 上限ガードの適切な閾値（50k は暫定。Issue の9000字の5倍強で安全弁とする）— 現行 50k+`…(truncated)` で実装済み
- `OPENCODE_GO_MAX_TOKENS` 環境変数による上書き: FR-004 で採用、`requestedMaxTokens ?? env(>0) ?? catalog ?? 4096` の優先度で実装。0/負数は無視し、明示 `requestedMaxTokens`（例: `generateTitle:60`）は env より優先


## References

- `functions/src/services/opencodeGo.ts` - `createRequest`, `parseChatCompletionsSSELine`, `normalizeProtocolStream`
- `functions/src/functions/chat.ts` - `createResponseStream`, `finalizeAssistant`
- `functions/tests/integration/sse.test.ts`
- `frontend/src/hooks/useChat.ts`
- `specs/000_backlog/items/P1-011-long-reasoning-error.md`
