# Implementation Plan: APIエラー時のユーザーフレンドリーな表示

**Branch**: `feat/p1-003-p2-003-p2-013` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Implementation Status**: Backend/Frontend実装と自動テスト完了（functions 140件、frontend 96件）。エラー分類・SSE error event・再試行・トークン付き401のログアウト遷移を実装。desktop/mobileの手動確認は未実施。

## Summary

現在はFrontendがHTTPレスポンス本文やSSEエラーをそのまま扱い、チャットストリーム中のBackendエラーはエラーチャンク送信後に`fullContent || '(No response)'`として通常のアシスタントメッセージへ保存される。安全なエラーコードへ正規化し、ユーザー向け文言・再試行・セッション期限切れを一貫して扱う。

**Implementation order**: P1-003で確定したgeneration/停止状態を前提に、P2-003のエラー伝播・再試行を実装し、最後にP2-013のloading/error接続を統合する。

P1-003のユーザー停止はエラーではなく中間保存として扱う。P2-013のローディング状態は本計画の責務外だが、取得失敗後に本計画のエラー状態へ遷移できる接続を用意する。

## Technical Context

**Frontend**: React 18, TypeScript, Vitest

**Backend**: Azure Functions v4, Jest

**Current seams**:

- `frontend/src/services/api.ts` がHTTPエラーを`ApiError`として生成する
- `frontend/src/services/chatApi.ts` がチャットSSEを読み取り、現在はSSEエラーを通常例外へ変換する
- `frontend/src/hooks/useChat.ts` がエラー文言をそのままstateとアシスタント表示へ渡す
- `frontend/src/App.tsx` がモデル取得・会話取得・設定取得の結果を画面へ配線する
- `functions/src/services/opencodeGo.ts` が上流HTTP/SSEエラーを生のError messageへ変換する
- `functions/src/functions/chat.ts` が上流エラーを通常SSE本文へ置換して保存する

**Constraints**:

- APIキー、Authorizationヘッダー、上流レスポンス本文、スタックトレース、ユーザープロンプトをUIや安全なログへ出さない
- 自動リトライは導入せず、ユーザー操作による再試行を基本とする
- 通常テスト・CIから実APIを呼ばない
- Functions APIの認証トークン期限切れ401は既存ログアウト遷移を維持する
- P1-003の停止処理とP2-013のローディング責務を侵食しない

## Design Decisions

### D1. 安全なErrorCodeを共有する

BackendからFrontendへ伝えるエラーは、`rate_limit`、`timeout`、`authentication`、`server`、`network`の有限なコードへ正規化する。原因の判定に必要なHTTP statusは内部処理で使用できるが、SSEイベントへは安定したcodeだけを出力する。

```ts
type SafeErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'authentication'
  | 'server'
  | 'network';
```

共通パッケージ化は避け、Backend・Frontendそれぞれの境界で同じ文字列契約をテストする。

### D2. ストリーム中のエラーは安全なSSEイベントで通知する

`functions/src/functions/chat.ts`は上流例外を通常のcontentチャンクや成功保存へ変換せず、以下の形式で1回だけ通知してストリームを終了する。

```text
data: {"error":{"code":"rate_limit"}}
```

Frontendの`streamChat`はこのイベントを検出して安全なErrorCodeへ変換し、`onError`へ渡す。APIキーや上流本文はイベントに含めない。

### D3. ユーザー停止とタイムアウトを区別する

`useChat.stop()`が設定したユーザー停止フラグまたはgeneration stateを`streamChat`へ渡す。ユーザー停止による`AbortError`は`onError`へ渡さず、P1-003の停止finalizeへ渡す。明示的なtimeout機構からのAbortだけを`timeout`へ分類する。

### D4. チャット再試行は既存ユーザーメッセージを識別する

チャット開始時にclient message/generation identifierを付与する。Backendは同じidentifierのユーザーメッセージを再保存せず、再試行では既存ユーザーメッセージを再利用してアシスタント生成だけを再実行する。識別子方式は既存Messageスキーマを不必要に拡張せず、サービス層の冪等性境界を検証して決定する。

### D5. セッション401をAPIキーエラーから除外する

通常HTTPリクエストでは、既存の`api.ts`がトークン付きFunctions APIの401で`logoutRedirect()`する挙動を維持する。チャットSSEは`chatApi.ts`が自前でfetchしているため、同じトークン付き401を検出して同じログアウト・再ログインフローへ接続する。APIキー無効メッセージは、上流OpenCode Goの認証失敗を安全なcodeとして受け取った場合だけ表示する。

### D6. エラー表示を共通化する

チャット、モデル一覧、会話一覧、設定取得で同じErrorCode→日本語文言マッピングを利用する。単一の大規模状態管理は導入せず、既存hooksのerror/retry callbackへ最小限の共通表示コンポーネントまたはmapperを追加する。

## Target Project Structure

```text
specs/P2-003/
├── spec.md
└── plan.md

functions/
├── src/
│   ├── functions/chat.ts                 # SSE error eventと保存抑止
│   └── services/opencodeGo.ts             # 上流エラー分類
└── tests/
    ├── integration/api.test.ts           # chat error contract
    └── unit/opencodeGo.test.ts            # status/SSE分類

frontend/
├── src/
│   ├── components/Common/ErrorMessage.tsx # 必要なら共通表示
│   ├── services/api.ts                   # HTTPエラー分類・安全化
│   ├── services/chatApi.ts               # SSE error event
│   ├── hooks/useChat.ts                  # retry stateと停止分離
│   ├── hooks/useConversations.ts         # load retry接続
│   ├── hooks/useSettings.ts              # settings retry接続
│   └── App.tsx                           # エラー表示・再試行配線
└── tests/unit/
    ├── api.test.ts
    ├── chatApi.test.ts
    ├── App.test.tsx
    └── useConversations.test.ts
```

## Implementation Phases

### Phase 0: Spec・エラー契約の確定

- [x] `spec.md`を作成しレビューする
- [x] SafeErrorCodeとユーザー向けメッセージを定義する
- [x] ユーザー停止のAbortErrorを除外する規則を定義する
- [x] ストリーム中のSSEエラーイベント形式を定義する
- [x] 再試行時のユーザーメッセージ重複禁止を定義する

### Phase 1: Backend error propagation

- [x] 上流HTTP statusとSSEエラーをSafeErrorCodeへ分類する
- [x] `chat.ts`で上流エラーを安全なSSE error eventへ変換する
- [x] エラー時に`(エラーが発生しました)`を成功本文として送信・保存しない
- [x] SSE error event後にストリームを終了する
- [x] 同一generation/client identifierのユーザーメッセージ保存を冪等にする
- [x] Functionsログを安全化し、APIキー・本文・stackを出さない

**Verification**:

- [x] 429、timeout、上流認証失敗、5xx、networkのcodeが期待どおりになる
- [x] SSEイベントにcode以外の機密情報が含まれない
- [x] ストリーム中のエラーが通常assistant messageとして保存されない
- [x] チャット再試行でuser messageが重複しない

### Phase 2: Frontend error normalization and retry

- [x] `api.ts`のHTTPエラーから生レスポンス本文をUIへ渡さない
- [x] `chatApi.ts`でSSE error eventを認識する
- [x] ErrorCodeから日本語メッセージを生成するmapperを追加する
- [x] `useChat`でエラーとユーザー停止を分離する
- [x] チャット再試行で同一入力・会話・identifierを再利用する
- [x] 会話一覧・モデル一覧・設定取得に対象処理だけの再試行を接続する
- [x] 再試行中の二重クリック・二重リクエストを防ぐ
- [x] `role=alert`または`role=status`でエラーを通知する
- [x] 通常HTTPとチャットSSEのトークン付き401で既存ログアウト遷移を維持する

**Verification**:

- [x] 各ErrorCodeで所定の日本語メッセージが表示される
- [x] 上流レスポンス本文・APIキー・AuthorizationがUIに表示されない
- [x] 再試行成功でエラーが解除される
- [x] 再試行失敗時に最新エラーが表示される
- [x] 停止操作でタイムアウトエラーが表示されない

### Phase 3: Automated tests

- [x] Functions unit/integration testでHTTP/SSE error contractを検証する
- [x] Frontend API mapperとSSE parserをstatus/code別に検証する
- [x] `useChat`の停止・エラー・再試行を検証する
- [x] Appのモデル・会話・設定取得エラーと再試行を検証する
- [x] エラー情報の機密漏えいを検出するテストを追加する

### Phase 4: Verification

- [x] `cd functions && npm run build && npm test`
- [x] `cd frontend && npm run build && npm test`
- [x] 実APIを呼ばない通常テストで完了することを確認する
- [ ] desktop/mobileでエラー表示・再試行を手動確認する（未実施）
- [x] `git diff --check`
- [x] spec Status、backlog、実装メモを更新する

## Verification Commands

```bash
cd functions && npm run build && npm test
cd frontend && npm run build && npm test
git diff --check
```
