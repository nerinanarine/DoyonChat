# Implementation Plan: 常時Agentモード・旧一問一答の廃止

**Spec**: [specs/P1-012/spec.md](./spec.md) | **Branch**: `feat/p1-012-p2-018-p2-019-p3-016` | **Created**: 2026-10-03

## Design Decisions

- **D1 — 先に判断点確定**: J1（画像添付）・J2（`defaultModel` 設定）の扱いを実装前にオーナーと確定する。既定案は両方削除
- **D2 — 削除順序**: Backend API → Frontend の順で削除し、各段階でビルド・テストを green に保つ
- **D3 — `model` フィールド温存**: `Conversation.model` と `DEFAULT_MODEL_ID` フォールバックは残す（表示名解決・既存データ互換）。書き込み経路のみ削除
- **D4 — 旧会話の扱い**: `agentMode: false` 会話は閲覧可・送信不可。送信時は 409 系エラー＋移行案内表示（文言は実装時に確定）
- **D5 — テスト**: 削除APIの不存在・Agent経路の無退行をテストで固定する

## Review Policy

- 各 Phase の成果物は完了条件として subagent `reviewer` によるレビューを必須とする（`reviewer` は読み取り専任。修正は `worker` が実施し、最終判断は parent が行う）
- レビュー観点：spec の受け入れ条件・FR との一致、既存動作の退行、今回差分外の変更混入

## Phases

### Phase 0 — 準備・判断点確定
- [ ] ~~J1・J2 をオーナーと確定する~~ → 2026-10-03 確定済み（両方削除）。FR-011 の棚卸しどおり実施する
- [ ] 本番データに `agentMode: false` 会話が存在するか実査する
- [ ] backlog P1-012 を 🟡 進行中に更新する

### Phase 1 — Backend 削除
- [ ] `functions/src/functions/chat.ts`：通常チャット分岐・`createResponseStream`・`MOCK_RESPONSE` を削除し Agent経路のみにする
- [ ] `functions/src/functions/conversations.ts`：`modelHandler`・`agentModeHandler`・作成時 `model` 検証を削除する
- [ ] `agentMode: false` 会話の送信ブロック（閲覧は維持）を実装する
- [ ] functions テスト更新（削除API不存在・Agent経路無退行・旧会話の閲覧/送信ブロック）
- [ ] `reviewer` レビューを通過してから Phase 2 へ進む

### Phase 2 — Frontend 削除
- [ ] `AppLayout` のモデル選択ドロップダウン・`draftModel` 配線を削除する
- [ ] `updateModel`・`updateConversationModel`・`updateConversationAgentMode` を削除する
- [ ] J1確定内容（画像添付：削除の場合は FR-011 の棚卸し対応、残置の場合は agent 経路との接続方針を確定）の対応、J2確定内容（`defaultModel` 設定）の対応
- [ ] frontend テスト更新、既存会話の送受信・承認フローに退行がないことを確認する
- [ ] `reviewer` レビューを通過してから Phase 3 へ進む

### Phase 3 — 仕上げ
- [ ] 未使用 import・到達不能コード・小残骸（`agentMode` バッジ・条件分岐・`updateAgentMode` ラッパ）・ドキュメント残骸（README・`specs/001-chat-app` 等の通常チャット記述）を除去する
- [ ] 全体横断の `reviewer` レビューを実施し、指摘を解消する
- [ ] backlog P1-012 の変更履歴を更新する（対応済み・コミット記載）
- [ ] コミット・プッシュ（要ユーザー承認）
