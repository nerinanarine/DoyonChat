# Implementation Plan: x-opencode-session ヘッダ付与・遅延作成・モデル1件追加

**Spec**: [specs/P2-015/spec.md](./spec.md) | **Branch**: `feat/p2-015-opencode-session-header` | **Created**: 2026-09-03

## Design Decisions

- **D1 — 安定ID**: ヘッダ値には `conversation.id`（`conversationService.createConversation()` で `crypto.randomUUID()` 払い出し）を使う。新規 ID 発行・ハッシュ化はしない。`chatHandler` と `titleAutoHandler` は既に所有者検証済みの会話 ID を持っている
- **D2 — 受け渡し**: `OpenCodeGoOptions` に `sessionId?: string` を追加し、`createRequest()` の3分岐（`responses` / `chat-completions` / `messages`）で値がある場合のみ `'x-opencode-session': sessionId` を付与する。`healthCheck()` は引数なしのまま（ヘッダなし）
- **D3 — チャット経路**: `chat.ts` の `createResponseStream()` は既に `conversationId` を受け取っているため、`streamChat(history, { model, signal })` 呼び出しに `sessionId: conversationId` を追加するのみとする
- **D4 — タイトル経路**: `generateTitle(text, signal)` に会話 ID 引数を追加し、`titleAutoHandler` から `conversation.id` を渡す。`generateTitle` 内部の `streamChat()` 呼び出しへ転送する
- **D5 — テスト**: 上流 `fetch` を mock した fixture contract test で3プロトコルのヘッダ付与を固定する。通常テスト・CI から実 API を呼ばない方針は維持する
- **D6 — 遅延作成**: `handleNewChat` は `create()` を呼ばず `setActiveConversationId(null)`＋`draftModel` 初期化のみとする。一覧への仮エントリは作らない（選択肢1）。会話未選択時の空表示・入力有効は既存動作を流用する
- **D7 — ドラフトモデル**: `App.tsx` に `draftModel` state（初期値は設定のデフォルトモデル、未設定なら `undefined` で backend 既定に委譲）を持ち、未選択中のヘッダー表示と `handleChangeModel` は `draftModel` を使う。`handleSend` の遅延パスは `draftModel` を `create()` に渡す
- **D8 — モデル追加**: `muse-spark-1.3-contributor` を `responses` で `modelCatalog.ts` へ追加する（1.2 の隣・公式表順）。公開メタデータは中立値＋1.2 同文の `description` とし、既定モデル・既存メタデータは触らない。件数テストは 26→27（responses 3→4）へ更新し、README と `specs/009-opencode-go-models/spec.md` の正規表も27件化する（P2-011 の Documentation 要件との同期維持）

## Review Policy

- 各 Phase の成果物は、完了条件として subagent `reviewer` によるレビューを必須とする（`reviewer` は読み取り専任。修正は `worker` が実施し、最終判断は parent が行う）
- レビュー観点：`spec.md` の受け入れ条件・FR との一致、既存動作の退行、機密情報のログ出力有無、今回差分外の変更混入
- 指摘事項は修正し、必要に応じて再レビューしてから次の Phase へ進む

## Phases

### Phase 0 — 準備
- [x] backlog P2-015 を作成（🔴 未対応）、本 spec/plan へリンク
- [ ] ブランチ `feat/p2-015-opencode-session-header` を `main` から作成済み

### Phase 1 — Backend (Azure Functions)
- [x] `functions/src/services/opencodeGo.ts`: `OpenCodeGoOptions` に `sessionId?: string` を追加
- [x] `functions/src/services/opencodeGo.ts`: `createRequest()` の3分岐に `x-opencode-session` 付与
- [x] `functions/src/functions/chat.ts`: `streamChat()` 呼び出しに `sessionId: conversationId` を追加
- [x] `functions/src/functions/conversations.ts` + `generateTitle()`: `conversation.id` の受け渡しを追加
- [x] functions テスト追加（3プロトコルのヘッダ有無・値一致、会話ごとの安定性）
- [x] 既存テスト・ビルドが green であることを確認（157/157 pass、tsc 成功）
- [x] `reviewer` による成果物レビューを実施し、指摘を解消してから Phase 2 へ進む（verdict: OK with notes、軽微2件をテスト追加で解消）

### Phase 2 — Frontend（新規チャット遅延作成）
- [x] `frontend/src/App.tsx`: `handleNewChat` を選択解除＋`draftModel` 初期化に変更（`create()` 呼び出し削除）
- [x] `frontend/src/App.tsx`: `draftModel` state 追加、未選択中のヘッダー表示・`handleChangeModel`・`handleSend` 遅延パスへ接続
- [x] frontend テスト追加（ボタン押下で `POST /conversations` なし・一覧不変、初回送信で `draftModel` 作成＋送信）
- [x] 既存会話の送受信・モデル変更・自動タイトルに退行がないことを確認。未送信ドラフトのリロード破棄は手動確認
- [x] `reviewer` による成果物レビューを実施し、指摘を解消してから Phase 3 へ進む（verdict: OK with notes。「undefined（利用不可）」→「モデル未選択」フォールバック＋テスト追加、裸JSX除去で解消。`X` 警告は既存確認済み）

### Phase 3 — モデルカタログ1件追加
- [x] `functions/src/config/modelCatalog.ts`: `muse-spark-1.3-contributor` を `responses` で追加（中立メタデータ＋1.2 同文 description）
- [x] 件数・ルーティングのテストを 26→27（responses 3→4）へ更新、`GET /api/models` の27件・固定順序を固定
- [x] README のモデル表と `specs/009-opencode-go-models/spec.md` の正規表を27件化
- [x] 通常テスト・ビルドが green であることを確認（親確認済み：functions 159/159、frontend 101/101）。live test は26/27：`grok-4.6` のみ上流キャパシティ不足で失敗（B案調査でヘッダあり・なし同一エラーを確認、今回変更は無関係と確定）。27/27は上流回復後に再実行
- [x] backlog P2-011 の備考・履歴へ「27件化は P2-015 で実施」の参照を追記
- [x] `reviewer` による成果物レビューを実施し、指摘を解消してから Phase 4 へ進む（verdict: 指摘なし）

### Phase 4 — 仕上げ
- [ ] 全体（Phase 1〜3 横断）の `reviewer` レビューを実施し、指摘を解消する
- [ ] backlog P2-015 の変更履歴を更新（対応済み・コミット記載）
- [ ] コミット・プッシュ（要ユーザー承認）
