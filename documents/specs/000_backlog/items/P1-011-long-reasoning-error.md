# P1-011: 長文推論時のエラー修正

## 概要

DeepSeek V4 Flash利用時、推論が9000字を超えるとエラーが発生する。長文の推論を含む応答でも正常に完了できるよう、原因を調査して修正する。

## 受け入れ条件

1. DeepSeek V4 Flashで推論が9000字を超える応答がエラーにならず、正常に完了する
2. 9000字を超える推論を含む再現テストを追加し、同じエラーが再発しないことを確認する
3. 通常の短い応答に対する既存のストリーミング動作を壊さない

## 関連Issue

- [GitHub Issue #20「推論が9000字を超えると、エラーが発生する。」](https://github.com/nerinanarine/DoyonChat/issues/20)

## 関連ファイル

- `functions/src/config/modelCatalog.ts`（DeepSeek系 maxTokens:16384）
- `functions/src/services/opencodeGo.ts`（finish_reason:length 等の正常完了扱い）
- `functions/src/functions/chat.ts`（REASONING_MAX_CODEPOINTS=50000截断）
- `functions/tests/unit/opencodeGo.test.ts` / `functions/tests/integration/sse.test.ts`

## 関連仕様

- [仕様](../../P1-011/spec.md)
- [実装計画](../../P1-011/plan.md)

## 実装メモ

- DeepSeek V4 Flash の9000字超推論で `max_tokens` 不足と `finish_reason:length` 未対応が原因。`modelCatalog` で16384へ引き上げ、SSE解析で `length`/`max_tokens`/`incomplete` を正常完了扱いに修正
- 推論は `REASONING_MAX_CODEPOINTS=50000` で `…(truncated)` 截断し保存、CosmosDB肥大を防止
- 本番デプロイ完了、Issue #20 対応済み

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-08-31 | 🔴 未対応 | GitHub Issue #20をバックログ化。DeepSeek V4 Flash利用時に発生 |
| 2026-09-01 | 🟢 対応済み | 実装・レビュー・本番デプロイ完了。modelCatalog/opencodeGo/chat.ts 修正、146/99テスト維持 |
