# P2-013: データ取得中のローディング画面

## 概要

チャットやモデル情報を取得している間、処理中であることが分かるローディング画面を表示する。

## 受け入れ条件

1. チャット取得中にローディング画面を表示する
2. モデル情報取得中にローディング画面を表示する
3. 取得が完了したらローディング画面を終了し、取得結果を表示する

## 関連Issue

- [GitHub Issue #34「ローディング画面の実装」](https://github.com/nerinanarine/DoyonChat/issues/34)

## 関連仕様

- [仕様](../../P2-013/spec.md)
- [実装計画](../../P2-013/plan.md)

## 関連ファイル

- `frontend/src/App.tsx`
- `frontend/src/components/Chat/ChatMessageList.tsx`
- `frontend/src/components/Layout/AppLayout.tsx`
- `frontend/src/hooks/useChat.ts`
- `frontend/src/hooks/useConversations.ts`
- `frontend/src/hooks/useSettings.ts`

## 実装メモ

- `LoadingState`によるbootstrap・モデル・会話メッセージ取得中の表示を実装
- `messagesLoading`と会話IDによる古いメッセージ応答の混入防止を実装
- 取得エラーを共通エラー表示と対象再試行へ接続
- Functions 140テスト、Frontend 96テスト、両build成功
- desktop/mobileの手動確認と本番確認は未実施

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-08-31 | 🔴 未対応 | GitHub Issue #34をバックログ化 |
| 2026-08-31 | 🟡 進行中 | 仕様・実装計画を作成 |
| 2026-09-01 | 🟢 対応済み | 実装・自動テスト完了（frontend 99件 / functions 140件）。本番デプロイまで管理済み |
