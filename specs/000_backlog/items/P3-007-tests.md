# P3-007: ユニットテスト強化

## 概要

現在のテストは基本的な構造のみ。主要なビジネスロジックを網羅的にテストする。

## 受け入れ条件

1. `useChat.ts` のフックテスト（メッセージ送信、ストリーミング、停止）
2. `useConversations.ts` の CRUD テスト
3. `conversationService.ts` の CosmosDB/in-memory 両方でのテスト
4. `opencodeGo.ts` の SSE パーステスト（各モデルの delta 形式）
5. カバレッジ 80% 以上
6. OpenCode Goの全23モデル実API疎通は[P2-011](P2-011-opencode-go-models.md)で実施済み（2026-08-23、23/23成功）。カタログ変更時はP2-011の専用live testを再実行する

## 関連ファイル

- `frontend/tests/`
- `backend/tests/`
- `functions/tests/`
- `backend/src/services/opencodeGo.ts`
- `functions/src/services/opencodeGo.ts`

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。全LLM疎通はP2-011の通常CIから分離した専用live testで実施済み。P3-007にはカバレッジ80%と残りの網羅的unit testを残す。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-08-12 | 🔴 未対応 | Grok 4.5などモデル固有のAPI経路を確認し、全LLMの実API疎通テストを別途実施する方針を追記 |
| 2026-08-23 | 🔴 未対応 | 全23モデル実API疎通をP2-011で23/23確認済みとして参照。残るunit test・カバレッジ要件は未対応 |
