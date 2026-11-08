# P2-005: 会話の手動リネーム

## 概要

将来の自動生成タイトル（P1-004）とは独立して、ユーザーが会話一覧から直接タイトルを編集できるようにする。

## Feature specification

- [仕様](../../008-rename-conversation/spec.md)
- [実装計画](../../008-rename-conversation/plan.md)

## 受け入れ条件

1. サイドバーの会話タイトルをクリックすると編集モードに入る
2. Enter で保存、Esc でキャンセル
3. 空のタイトルは保存されない（前のタイトルを維持）

## 関連ファイル

- `frontend/src/components/Sidebar/ConversationList.tsx`
- `frontend/src/hooks/useConversations.ts`
- `frontend/src/services/chatApi.ts`
- `functions/src/functions/conversations.ts`
- `functions/src/services/conversationService.ts`

## 実装メモ

- Azure Functionsに`PUT /api/conversations/{id}/title`を追加
- trim後1〜100 Unicodeコードポイントで検証し、所有権境界と404方針を維持
- Cosmos DBとin-memory storeの両方でタイトルだけを更新し、`updatedAt`と一覧順を維持
- サイドバーにEnter保存、Esc/blurキャンセル、IME対応、失敗時再試行付きのインライン編集を追加
- Functions 39テスト、Frontend 29テスト、両build成功
- desktopブラウザで保存・キャンセル・再試行・見出し更新・再読み込み・一覧順維持を確認済み
- mobile viewport（390×844）で編集・保存・Escキャンセルを確認済み
- ユーザー確認により本番デプロイ済み

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-08-22 | 🟡 進行中 | 実装・自動テスト完了、desktop/mobile手動確認待ち |
| 2026-08-22 | 🟢 対応済み | desktop/mobile viewport確認完了、本番デプロイ済み |
