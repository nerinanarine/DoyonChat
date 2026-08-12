# P3-007: ユニットテスト強化

## 概要

現在のテストは基本的な構造のみ。主要なビジネスロジックを網羅的にテストする。

## 受け入れ条件

1. `useChat.ts` のフックテスト（メッセージ送信、ストリーミング、停止）
2. `useConversations.ts` の CRUD テスト
3. `conversationService.ts` の CosmosDB/in-memory 両方でのテスト
4. `opencodeGo.ts` の SSE パーステスト（各モデルの delta 形式）
5. カバレッジ 80% 以上
6. OpenCode Goのモデルカタログに含まれる全LLMについて、実APIへの疎通テストを別途実施する

## 関連ファイル

- `frontend/tests/`
- `backend/tests/`
- `functions/tests/`
- `backend/src/services/opencodeGo.ts`
- `functions/src/services/opencodeGo.ts`

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。実APIを呼び出す全LLM疎通テストは、API利用料・レート制限を考慮して通常のCIとは分離した別工程で実施する。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-08-12 | 🔴 未対応 | Grok 4.5などモデル固有のAPI経路を確認し、全LLMの実API疎通テストを別途実施する方針を追記 |
