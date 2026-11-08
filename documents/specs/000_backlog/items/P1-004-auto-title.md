# P1-004: 会話タイトルの自動生成

## 概要

会話タイトルを AI（OpenCode Go）に要約させて自動生成する。現在、送信時に会話を自動生成した場合は最初のユーザーメッセージ先頭30文字切り出しがタイトルになり、「新規チャット」ボタンで作成した会話は `New Chat` のまま残る。AI 要約により識別性を向上させる。

## 受け入れ条件

1. 新規会話作成後、最初のメッセージ送信時にタイトルが自動生成される
2. 生成されたタイトルは会話一覧に反映される
3. タイトル生成に失敗しても、チャット機能は継続して動作する

## 実装案

- シンプル版: 最初のユーザーメッセージを 30 文字で切ってタイトルにする（送信時自動作成パスのみ現状実装済み）
- 高度版: AI に「以下のメッセージから 30 文字以内のタイトルを生成してください」と問い合わせる（本件で採用）

## 関連ファイル

- `frontend/src/App.tsx`（handleSend トリガー）
- `frontend/src/hooks/useConversations.ts`
- `functions/src/functions/conversations.ts`（title/auto エンドポイント新設）
- `functions/src/services/opencodeGo.ts`（generateTitle 新設）

## 実装メモ

- Backend: `opencodeGo.ts` に `generateTitle()`（既存 streamChat で content チャンク収集・reasoning 無視・タイムアウト20秒・`OPENCODE_GO_TITLE_MODEL || deepseek-v4-flash`、カタログ外時は console.warn 付きフォールバック）と `sanitizeGeneratedTitle()`（最初の非空行のみ・引用符除去・コードポイント基準100字切り詰め・空時30字フォールバック）を追加。`conversations.ts` に `POST conversations/{id}/title/auto`（authLevel anonymous + authenticateRequest、ボディ { text } 検証400、所有者不一致404、失敗時503）。生成元テキストをボディで渡す方式によりメッセージ永続化とのレースなし。
- Frontend: `useConversations.ts` に `NEW_CHAT_TITLE` 定数共有・renamedIds ref・Conversation 単体置換の autoTitle()。`App.tsx` handleSend で fire-and-forget トリガー（新規会話は create 戻り値 conv.id、既存はタイトル一致判定、画像のみスキップ、エラー握りつぶし）。
- インフラ: `infra/modules/functions.bicep` に `OPENCODE_GO_TITLE_MODEL`（デフォルト deepseek-v4-flash）app setting を追加。
- テスト: functions 単体+integration 追加（計121テスト pass）、frontend トリガー条件テスト追加（72テスト pass）。
- コミット: `481103e` docs(spec/plan/backlog) / `09bc7f6` feat(実装)。レビューは oracle/delegate で実施し Must Fix 5件（レース解消のためテキストをボディで渡す設計・streamChat 収集方式固定・コードポイント基準サニタイズ・レスポンス形式訂正等）を反映済み。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-08-23 | 🟡 進行中 | specs/P1-004/spec.md・plan.md 作成（oracle/delegate レビュー反映済み）。ブランチ feat/004-auto-conversation-title。AI 生成（deepseek-v4-flash デフォルト）を採用 |
| 2026-08-23 | 🟢 対応済み | 実装・テスト完了、本番デプロイ済み |
