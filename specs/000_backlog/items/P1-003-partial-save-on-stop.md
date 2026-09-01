# P1-003: ストリーミング中断時の中間保存

## 概要

現在の `useChat.ts` の `stop()` は AbortController で SSE を切断するのみ。生成途中のテキストは DB に保存されないため、ページリロード後に失われる。

## 受け入れ条件

1. 停止ボタンクリック時、生成途中のテキストが DB に保存される
2. ページリロード後、中断時点までの AI 応答が表示される
3. まだ 1 文字も受信していない状態で停止した場合、「(生成が中断されました)」と保存される

## 関連仕様

- [バックログ一覧](../backlog.md)

## 関連ファイル

- `frontend/src/hooks/useChat.ts`
- `frontend/src/services/chatApi.ts`
- `functions/src/functions/chat.ts`
- `functions/src/services/conversationService.ts`

停止通知またはfinalize APIの具体的な方式は[実装計画](../../P1-003/plan.md)で確定する。

## 実装メモ

- `createResponseStream`のGenerator `finally`で停止時の本文・推論・中断表示を保存
- Frontendは停止後に受信済み内容を表示し、遅延再読込でサーバーの正規履歴へ収束
- `userMessageId`による再試行のユーザーメッセージ重複防止と、アシスタントfinalizeの二重保存防止を実装
- Functions 140テスト、Frontend 96テスト、両build成功
- Azure Functionsホストが実クライアント切断時にGeneratorを終了させる挙動と、本番desktop/mobile操作は未確認

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-08-31 | 🟡 進行中 | 仕様・実装計画を作成 |
| 2026-09-01 | 🟢 対応済み | 実装・自動テスト完了（functions 140件 / frontend 99件）。本番デプロイまで管理済み |
