# Implementation Plan: データ取得中のローディング画面

**Branch**: `feat/p1-003-p2-003-p2-013` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Implementation Status**: Frontend実装と自動テスト完了（frontend 96件、functions 140件）。初期bootstrapローディング、会話メッセージloading、モデル/設定取得中表示、P2-003のerror/retry接続を実装。desktop/mobileの手動確認は未実施。

## Summary

現在はモデル一覧に`modelsStatus`がある一方、初期データ取得全体を示す画面がなく、会話メッセージ取得には専用loading stateがない。既存hooksの状態を再利用し、初期表示・モデル取得・会話一覧・設定・メッセージ取得を対象ごとに表示する。

**Implementation order**: P1-003、P2-003の順で共有するストリーム・エラー状態を確定した後、P2-013でloadingとerror/retryの画面接続を仕上げる。

取得失敗時は無限ローディングにせず、P2-003のエラー表示へ接続する。AI応答のストリーミング中表示は既存の生成中表示を維持し、データ取得中のローディングと混同しない。

## Technical Context

**Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Vitest

**Current seams**:

- `frontend/src/App.tsx` がモデル一覧・会話一覧・設定を画面へ配線する
- `useConversations` が`loading`と`error`を保持する
- `useSettings` が`status: loading | error | loaded`を保持する
- `App`が`modelsStatus: loading | error | loaded`を保持する
- `useChat`の`loadMessages`には現在専用loading stateがない
- `AppLayout`のモデル選択は`modelsStatus !== 'loaded'`で無効化されている
- `ChatInput`は会話一覧loadingやモデル利用不可状態で無効化される

**Constraints**:

- 既存のstatus stateを二重管理しない
- ローディング中に未取得データを選択・送信させない
- 取得失敗時はP2-003へ渡し、無限ローディングにしない
- AI応答ストリーミング中の表示を置き換えない
- desktop/mobileの既存レイアウトを維持する

## Design Decisions

### D1. 共通のLoadingState表示を最小コンポーネントで提供する

対象名とアクセシブルなラベルを受け取る小さな`LoadingState`コンポーネントを追加する。アニメーションは必須とせず、`role=status`と意味のあるテキストを必須とする。既存画面の構造を大きく変更せず、初期表示とチャット領域の両方で再利用する。

### D2. 初期表示は必要なbootstrap状態を集約する

認証後またはdata enabled後、会話一覧・モデル情報・設定の取得中は、操作可能なアプリ画面の代わりに初期LoadingStateを表示する。いずれかがerrorになった場合はP2-003のエラー表示へ遷移し、loadedになったデータだけを無理に操作させない。

### D3. メッセージ取得にはuseChat専用stateを追加する

`useChat`へ`messagesLoading`を追加し、会話選択ごとの取得開始・成功・失敗を追跡する。選択変更時には古いメッセージとの混在を防ぎ、現在の取得対象と一致する結果だけを表示する。

### D4. モデル選択中の既存表示を拡張する

`modelsStatus`をsource of truthとして、モデル選択ボタン・設定メニュー・初期画面の表示を統一する。モデル取得完了前はモデル選択を無効にし、取得完了後に選択可能にする。

### D5. 取得エラーはP2-003へ委譲する

loading stateがerrorへ遷移したとき、対象データとエラーをP2-003の共通表示・再試行callbackへ渡す。P2-013内に別のエラーメッセージ体系を作らない。

### D6. ストリーミング表示は別状態として維持する

`isStreaming`はAI生成中の表示にのみ使用する。`messagesLoading`は会話履歴取得の表示にのみ使用し、取得完了後も生成中表示が必要な場合は独立して表示できる状態を保つ。

## Target Project Structure

```text
specs/P2-013/
├── spec.md
└── plan.md

frontend/
├── src/
│   ├── App.tsx                              # bootstrap loading/error集約
│   ├── components/Common/LoadingState.tsx   # 共通loading表示
│   ├── components/Layout/AppLayout.tsx     # モデル取得中表示の配線
│   ├── components/Chat/ChatMessageList.tsx # messages loading表示
│   ├── hooks/useChat.ts                     # messagesLoading
│   ├── hooks/useConversations.ts            # retry/error配線
│   └── hooks/useSettings.ts                 # retry/error配線
└── tests/unit/
    ├── App.test.tsx
    ├── AppLayout.test.tsx
    ├── ChatMessageList.test.tsx
    ├── useConversations.test.ts
    └── LoadingState.test.tsx
```

## Implementation Phases

### Phase 0: Spec・状態境界の確定

- [x] `spec.md`を作成しレビューする
- [x] 実装順序をP1-003 → P2-003 → P2-013として確定する
- [x] 会話・モデル・設定・メッセージのloading対象を定義する
- [x] P2-003のエラー状態との境界を定義する
- [x] ストリーミング中表示との境界を定義する

### Phase 1: 共通表示とbootstrap loading

- [x] アクセシブルな`LoadingState`コンポーネントを追加する
- [x] Appで会話・モデル・設定の状態を集約する
- [x] 必要な初期データ取得中にLoadingStateを表示する
- [x] 初期データ取得完了後に既存AppLayoutへ遷移する
- [x] 初期取得失敗時にP2-003のerror/retry表示へ接続する

**Verification**:

- [x] 会話・モデル・設定の遅延中に初期loadingが表示される
- [x] すべてloaded後にloadingが消える
- [x] 取得失敗時に無限loadingにならない
- [x] 未取得モデルを選択・送信できない

### Phase 2: 会話メッセージとモデルUI

- [x] `useChat`へ`messagesLoading`と対象conversation IDを追加する
- [x] 会話切り替え時にChatMessageListへメッセージ取得中を表示する
- [x] メッセージ取得中の送信・誤操作を防ぐ
- [x] 古い会話のレスポンスが現在会話へ混入しないようにする
- [x] AppLayoutとSettingsMenuのモデル取得中表示を統一する
- [x] 取得完了後に通常の空会話・履歴表示へ戻す

**Verification**:

- [x] 会話選択後、メッセージ取得中にローディングが表示される
- [x] 取得完了後、選択会話のメッセージだけが表示される
- [x] 会話切り替えの遅延レスポンスが混在しない
- [x] モデル取得中の選択UIが無効化される
- [x] `isStreaming`と`messagesLoading`が独立して動作する

### Phase 3: P2-003接続とアクセシビリティ

- [x] loading対象ごとのerror/retry callbackをAppへ配線する
- [x] error時に対象ローディングを解除する
- [x] `role=status`、ラベル、完了時のDOM状態を整える
- [x] desktop/mobileでレイアウトシフトを抑える

### Phase 4: Automated tests

- [x] LoadingState単体テストを追加する
- [x] Appのbootstrap loading/error/loaded遷移をテストする
- [x] ChatMessageListのmessages loading表示をテストする
- [x] 会話切り替え時の古いレスポンス混入防止をテストする
- [x] AppLayout/SettingsMenuのmodelsStatus表示をテストする
- [x] P2-003の再試行callbackが正しい対象だけを再取得することをテストする

### Phase 5: Verification

- [x] `cd functions && npm run build && npm test`
- [x] `cd frontend && npm run build && npm test`
- [ ] desktop/mobile viewportで初期表示・会話切り替え・モデル取得を手動確認する（未実施）
- [x] `git diff --check`
- [x] spec Status、backlog、実装メモを更新する

## Verification Commands

```bash
cd functions && npm run build && npm test
cd frontend && npm run build && npm test
git diff --check
```
