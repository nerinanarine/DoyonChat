# P1-004: 会話タイトルの自動生成 — Implementation Plan

**Status**: Draft
**Spec**: [spec.md](spec.md)
**Branch**: `feat/004-auto-conversation-title`

## Design Decisions

- **D1 — API**: `functions/src/functions/conversations.ts` に `titleAutoHandler` を追加。`app.http('conversation-title-auto', { methods: ['POST'], route: 'conversations/{id}/title/auto', authLevel: 'anonymous' })`。ハンドラ内で `authenticateRequest`（既存 titleHandler と同一パターン）。会話の所有者チェックは既存 service 関数で userId 比較 → 404。ボディ `{ text }` は空でない string のみ有効、それ以外は 400
- **D2 — 生成ロジック**: `services/opencodeGo.ts` に `generateTitle(text: string, signal?: AbortSignal): Promise<string>` を新設。**既存 `streamChat()` で content チャンクを収集して連結する方式に固定**（`createRequest` は3プロトコル全て `stream: true` 固定のため非ストリーミングパーサは新規実装しない）。reasoning チャンクは無視。タイムアウト20秒（AbortSignal）。モデルは `process.env.OPENCODE_GO_TITLE_MODEL || 'deepseek-v4-flash'`、カタログ外時は同モデルへフォールバック + `console.warn`
- **D3 — サニタイズ**: functions 側で最初の非空行のみ採用、前後空白と囲み引用符（`"`, `'`, `「」`, `""` 等）を除去、**コードポイント基準**（`Array.from(...).slice(0, 100).join('')`、既存 titleHandler と同じ基準）で切り詰め。空になった場合はフォールバックとして `Array.from(text).slice(0, 30).join('')` を採用
- **D4 — タイトル保存**: 既存 `updateConversationTitle(id, title, userId)` を再利用し、更新後の Conversation 単体を返す（PUT /title と同形式）。OpenCode Go 例外時は AppError(503) を投げるがフロントは握りつぶす
- **D5 — フロントトリガー**: `App.tsx` の `handleSend` 内。メッセージ送信直後（AI 応答の完了は待たない）に fire-and-forget で `autoTitle(convId, text)` を呼ぶ。会話IDは state の `activeConversationId` ではなく **`create()` 戻り値の `conv.id`** を使う（既存 setTimeout 経路と同型の state 参照バグ防止）。生成元テキストはボディで渡すためメッセージ永続化とのレースは発生しない。条件: (a) この送信で会話を新規作成した、または (b) 現在のタイトルが定数 `NEW_CHAT_TITLE`（'New Chat'）と一致、かつ当該会話をこのセッション内で手動リネームしていない。画像のみ・空テキストでは呼ばない
- **D6 — 手動リネーム判定**: `useConversations.ts` に `renamedIds`（ref の Set）を追加し、`updateTitle` 成功時に記録。自動生成成功時はタイトルが `New Chat` 以外になるため以降トリガー条件 (b) が成立しない
- **D7 — 一覧反映**: 自動生成APIのレスポンス Conversation 単体で conversations state を置換する関数を `useConversations.ts` に追加（既存 updateModel/updateTitle の更新パターンと同じ）
- **D8 — テスト方針**: functions 単体テスト（正常系/400/401/404/サニタイズ/コードポイント切り詰め/reasoning チャンク混在でも content のみ/フォールバック）+ integration 追加。frontend は handleSend トリガー条件・正しい convId 使用・失敗時無言をテスト

## Phases

### Phase 0 — 準備
- [ ] spec.md / plan.md 作成（レビュー反映）
- [ ] backlog P1-004 を 🔴→🟡 に更新、関連ファイル記述を `functions/` 前提に修正、概要の「New Chat のまま」表現を実態（slice(0,30) 切り出しあり）に合わせて更新、spec リンク追記

### Phase 1 — Backend
- [ ] `opencodeGo.ts`: `generateTitle()` 実装（streamChat 収集、タイムアウト、モデルフォールバック + console.warn）
- [ ] `conversations.ts`: `POST conversations/{id}/title/auto` エンドポイント（認証/所有者/400/404/サニタイズ/保存）
- [ ] functions 単体テスト + integration テスト追加
- [ ] verify: `cd functions && npm run build && npm test`

### Phase 2 — Frontend
- [ ] `chatApi.ts`（または api.ts）: `autoGenerateTitle(id, text)` 追加
- [ ] `useConversations.ts`: renamedIds ref、Conversation 単体置換関数、`NEW_CHAT_TITLE` 定数共有
- [ ] `App.tsx`: handleSend にトリガー実装（fire-and-forget、エラー握りつぶし、conv.id 使用）
- [ ] verify: `cd frontend && npm run build && npm test && npm run lint`

### Phase 3 — 自動テスト
- [ ] functions: generateTitle モックでの単体テスト（サニタイズ、空→30字フォールバック、reasoning 混在、100字コードポイント切り詰め、400/401/404）
- [ ] frontend: トリガー条件テスト（新規作成時 / New Chat 時 / リネーム済みスキップ / 失敗時無言 / 正しい convId 使用）

### Phase 4 — E2E / デプロイ
- [ ] ローカル E2E: 新規チャット→初回送信→タイトル置換→手動リネーム優先の確認
- [ ] `OPENCODE_GO_TITLE_MODEL` を本番 Function App 設定に追加するか決定（未設定なら `deepseek-v4-flash`）。会話ごとに成功まで最大1回/送信の LLM 呼び出しが発生し得る点も踏まえて判断
- [ ] 本番デプロイ後の動作確認
- [ ] spec Status 更新・backlog 🟢・実装メモ記載

## Verification Commands

```bash
cd functions && npm run build && npm test
cd frontend && npm run build && npm test && npm run lint
git diff --check
```
