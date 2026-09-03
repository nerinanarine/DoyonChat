# P2-016: grok-4.6 の上流キャパシティ不足への追従

## 概要

P2-015 の live test（2026-09-03実施）で27件中 `grok-4.6` のみ失敗した。原因は上流（xAI側）のキャパシティ不足であり、P2-015 の変更（`x-opencode-session` 付与）とは無関係であることを、ヘッダあり・なしの単発疎通で確定済み。上流回復後に live test 27/27 を再確認する。

上流エラーメッセージ（HTTP 200 の SSE `error` イベント）：

> Streaming response failed: [error] The model is currently at capacity due to high demand. Please try again in a few minutes, or use a higher service tier for priority processing

## 受け入れ条件

1. 上流回復後に `cd functions && npm run test:live:models` で27/27成功する
2. P2-015 の SC-006（live test 27/27）を満たす

## スコープ境界

- コード変更は原則不要（再実行のみ）。上流の恒常的な提供終了・モデルID変更が判明した場合はカタログ対応を別途検討する
- P2-015 本体の受け入れには含めない（上流ブロックのため分離）。P2-015 は26/27＋原因確定をもって完了扱いとする

## 関連ファイル（想定）

- `functions/live-tests/models.live.test.ts`
- `functions/src/config/modelCatalog.ts`（変更が必要になった場合のみ）

## 依存関係

- **ブロックする:** なし
- **ブロックされる:** 上流（xAI側）のキャパシティ回復
- **関連:** P2-015（切り出し元。SC-006 が本項目の受け入れ1に委譲）

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-03 | 🔴 未対応 | P2-015 live test の残件（26/27）として切り出し |
