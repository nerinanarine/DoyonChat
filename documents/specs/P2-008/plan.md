# Implementation Plan: ユーザーごとに設定を保存できる機能

**Spec**: [specs/P2-008/spec.md](./spec.md) | **Branch**: `feat/008-user-settings` | **Created**: 2026-08-23

## Design Decisions

- **D1 — API**: Azure Functions v4 で `functions/src/functions/users.ts` を新設。`app.http('user-settings', { methods: ['GET','PATCH'], route: 'users/me/settings', authLevel: 'anonymous' })` とし、ハンドラ内で既存 `authenticateRequest` を呼ぶ（他エンドポイントと同じパターン）。`index.ts` に import 追加
- **D2 — 永続化**: Cosmos DB `userSettings` コンテナ（PK `/userId`）。`db/index.ts` に `getUserSettingsContainer()` を追加。ドキュメントは 1ユーザー1ドキュメントで `id === userId` とし、`item(userId, userId)` の点読みを行う（query 不要）。構造 `{ id: userId, userId, settings, updatedAt }`
- **D3 — サービス**: `services/userSettingsService.ts` を新設。`getSettings(userId)` は未保存時に `{ userId, settings: {} }` を返す（書き込みなし）ほか、保存済み `defaultModel` が modelCatalog に存在しない場合は応答から除外する。`updateSettings(userId, partial)` は既知キーのみマージし（`defaultModel: null` でキー削除）、本文中の `id`/`userId` 等の予約キーは無視。Cosmos アクセスは既存 `conversationService.ts` と同じパターン（`ensureContainer()` + `COSMOSDB_REQUIRED=false` 時は in-memory fallback、true 時は失敗 `AppError(503)`）に従う
- **D4 — バリデーション**: `PATCH` 本文の `defaultModel` は `config/modelCatalog.ts` の `hasModel()` で検証し、不正なら `AppError(400)`。既知キーは今回 `defaultModel` のみ
- **D5 — フロント状態管理**: `hooks/useSettings.ts` を新設。ログイン直後に `GET /api/users/me/settings` を1回取得し、`{ settings, updateSettings }` を公開。保存は楽観更新 + PATCH、失敗時はロールバックしてエラー表示
- **D6 — 新規会話への適用**: `App.tsx` の `handleNewChat` / `handleSend`（会話自動生成）で `create(title, settings.defaultModel)` を渡す。未設定・無効値・設定取得完了前の場合は `undefined` → 従来どおり Functions 側 `DEFAULT_MODEL_ID`。既存会話のモデルは変更しない。実装上の注意: 両ハンドラの `useCallback` 依存配列に settings が加わる点、および `handleSend` は `setTimeout` 経由でメッセージ送信するため会話生成時に model が正しく渡る点に留意
- **D7 — UI**: `components/Settings/SettingsMenu.tsx` を新設。ヘッダーに歯車アイコンボタン（Auth 有効時のみ）を置き、クリックで設定パネル（モデルセレクト + ログアウトボタン + 閉じる）を開く。既存ヘッダーの `LogOut` ボタンは削除。モデル選択肢は既存の `models` props（`/api/models` 取得済み）を流用し、`modelsStatus !== 'loaded'` の間は disabled + 理由表示（AppLayout のモデルメニューと同パターン）。保存済み defaultModel がカタログに存在しない場合は「利用不可」と表示し再選択を促す
- **D8 — インフラ**: `infra/modules/cosmosdb.bicep` に `userSettingsContainer` を追加（conversations/messages と同パターン）

## Phases

### Phase 0 — 準備
- [x] backlog P2-008 を 🔴→🟡 に更新、受け入れ条件3（localStorage フォールバック）を「対象外」に変更、spec リンク追記
- [x] backlog の theme 初期項目を対象外に変更、「現状 localStorage ベース」背景と `backend/src/...` 関連ファイル記述を `functions/` 前提に修正

### Phase 1 — Backend (Azure Functions)
- [x] `infra/modules/cosmosdb.bicep`: userSettings コンテナ追加
- [x] `functions/src/db/index.ts`: `getUserSettingsContainer()` 追加
- [x] `functions/src/services/userSettingsService.ts`: getSettings / updateSettings
- [x] `functions/src/functions/users.ts`: GET/PATCH ハンドラ + `app.http('user-settings', ...)` 登録
- [x] `functions/src/index.ts`: `import './functions/users'` 追加
- [x] functions 単体テスト追加（正常系、400 不正モデル、401 未認証、部分更新マージ、null 解除、空本文 no-op、予約キー無視、他ユーザー分離 alice/bob）
- [x] 既存 integration テスト（`functions/tests/`）に GET/PATCH/401/400 ケースを追加。`db` mock（`getConversationsContainer` 等）に `getUserSettingsContainer` の mock を追加しないと落ちる点に注意

検証: `cd functions && npm run build && npm test`

### Phase 2 — Frontend
- [x] `types/index.ts`: `UserSettings` 型追加
- [x] `services/api.ts`: `patch<T>()` 追加（現状 GET/POST/PUT/DELETE のみのため）
- [x] `services/chatApi.ts`（または新規 settingsApi）: `fetchUserSettings()` / `updateUserSettings()`
- [x] `hooks/useSettings.ts`: D5 どおり実装
- [x] `components/Settings/SettingsMenu.tsx`: 設定パネル UI（D7）
- [x] `components/Layout/AppLayout.tsx`: ヘッダーの歯車ボタン追加・`LogOut` 直置きボタン削除
- [x] `App.tsx`: useSettings 統合、handleNewChat/handleSend へ defaultModel 反映

検証: `cd frontend && npm run build && npm test && npm run lint`

### Phase 3 — 自動テスト
- [x] frontend: useSettings の取得/保存/失敗テスト、SettingsMenu のレンダリング・ログアウト発火テスト、新規会話が defaultModel を使うテスト、AppLayout テスト更新（ヘッダーに LogOut ボタンが無いこと・設定ボタンがあること）
- [x] functions: Phase 1 のテストを通す

### Phase 4 — 検証・リリース
- [x] ローカル E2E（Functions 起動 + vite dev、Auth 有効）: 設定保存→別ブラウザ復元→新規会話反映→設定メニューからログアウト
- [x] デプロイ順序: **Bicep（userSettings コンテナ作成）→ Functions** の順で適用し、コンテナ未作成のまま Functions だけ出さないことを確認
- [x] 本番デプロイ後の動作確認
- [x] spec Status 更新、backlog 🟢、実装メモ記載

## Verification Commands

```bash
cd functions && npm run build && npm test
cd frontend && npm run build && npm test && npm run lint
git diff --check
```
