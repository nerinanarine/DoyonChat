# Feature Specification: ユーザーごとに設定を保存できる機能

**Feature Branch**: `feat/008-user-settings` | **Spec Folder**: `specs/P2-008` | **Created**: 2026-08-23

**Status**: Draft

**Input**: [P2-008 backlog item](../000_backlog/items/P2-008-user-settings.md)

> **現行構成に関する注記:** Backendは Azure Functions (`functions/`)。認証は Entra ID（全ユーザーログイン必須）。バックログ記載の `backend/src/...` は旧構成のため `functions/` 配下に読み替える。未認証時の localStorage フォールバックは本仕様では対象外とする（バックログ受け入れ条件3を本仕様で変更）。

## User Scenarios & Testing

### User Story 1 - 設定メニューからデフォルトモデルを設定し、新規会話に反映する (Priority: P1)

ユーザーは設定メニューでデフォルトモデルを選択でき、以降の新規会話がそのモデルで作成される。

**Why this priority**: 本機能の核心価値。会話ごとのモデル再選択の手間をなくす。

**Independent Test**: 設定メニューでデフォルトモデルを変更し、「New Chat」で新規会話を作成して、そのモデルが選択したモデルになっていることを確認できる。

**Acceptance Scenarios**:

1. **Given** ログイン済みで設定メニューを開いた状態、**When** デフォルトモデルを選択する、**Then** 保存成功時は選択が維持され、保存失敗時はエラー表示のうえ元の選択へ戻る
2. **Given** デフォルトモデルを設定済みの状態、**When** 新規会話を作成する、**Then** 会話のモデルは設定したデフォルトモデルになる
3. **Given** デフォルトモデルを設定していない状態（初期状態）、**When** 新規会話を作成する、**Then** 従来どおり既定モデル（`DEFAULT_MODEL_ID`）で作成される

### User Story 2 - 設定が別デバイスでも復元される (Priority: P1)

設定はサーバーに保存され、別デバイス・別ブラウザでログインしても前回の設定が復元される。

**Why this priority**: バックログ背景の「デバイスを変えると設定がリセットされる」問題の解消。

**Independent Test**: ブラウザAでデフォルトモデルを設定後、ブラウザBで同じアカウントにログインし、設定メニューに同じデフォルトモデルが表示されることを確認できる。

**Acceptance Scenarios**:

1. **Given** ブラウザAで設定済みの状態、**When** ブラウザBで同じアカウントにログインする、**Then** 設定メニューにブラウザAで設定した内容が表示される
2. **Given** 設定を一度も変更していない新しいアカウントの状態、**When** 設定を取得する、**Then** 空の設定（デフォルト値なし）が返され、アプリは従来動作で動く

### User Story 3 - ログアウトボタンが設定メニューに配置される (Priority: P1)

ヘッダー直置きのログアウトボタンを設定メニュー内へ移動し、設定メニューからログアウトできる。

**Why this priority**: ユーザー指定要件。ヘッダーの誤タップ防止とUI整理。

**Independent Test**: ヘッダーにログアウトボタンが存在しないことを確認し、設定メニューを開いてログアウトを実行するとログイン画面へ遷移することを確認できる。

**Acceptance Scenarios**:

1. **Given** ログイン済みの状態、**When** ヘッダーを確認する、**Then** ログアウトボタンは表示されず、代わりに設定メニューボタンが表示される
2. **Given** 設定メニューを開いた状態、**When** ログアウトをクリックする、**Then** Entra ID のログアウトフローが実行されログイン画面へ遷移する

## Edge Cases

- **設定API障害時**: 設定の取得・保存に失敗してもチャット本体は通常どおり動作する（デフォルトモデルなしで継続）。保存失敗はUIにエラーを表示する
- **不正なモデルID**: `PATCH` に modelCatalog に存在しない `defaultModel` を渡すと 400 を返す
- **未知の設定キー**: クライアントが送ってきた未知のキーはサーバー側で無視する（settings 構造は拡張可能だが検証済みキーのみ保存）
- **同時更新**: 最終書き込みが優先される（楽観更新。競合制御は対象外）
- **Auth 無効モード（開発用）**: フロント `VITE_AUTH_ENABLED=false` では設定メニュー自体を非表示にする（サーバー保存ができないため）。バックエンド `AUTH_ENABLED=false` 時は `dev-user` として動作し設定API自体は応答するが、実ユーザー設定と混在し得る開発用挙動として扱う
- **models 取得失敗時**: 設定メニューのモデルセレクトは選択肢なしで disabled となり、保存済み defaultModel の値自体は保持される
- **カタログから削除されたモデル**: 保存済み `defaultModel` が modelCatalog から削除された場合、GET はその値を返さない（サーバー側の自動書き換えはしない）。フロントは未設定と同様に扱い、新規会話は `DEFAULT_MODEL_ID` で作成される。設定UIでは「利用不可」と表示し再選択を促す
- **設定取得前の新規会話**: 設定の GET 完了前に新規会話を作成した場合は従来どおり `DEFAULT_MODEL_ID` で作成される
- **Cosmos DB 障害・コンテナ未作成**: コンテナは必須とし、アクセス失敗時は 503 を返す（conversations の失敗系に揃える）。チャット本体には影響させない
- **既存会話への影響**: 設定変更は既存会話のモデルを変更しない（新規会話のみに適用）

## Requirements

### Functional Requirements

- **FR-001**: ヘッダーに設定メニューを開くボタンを追加しなければならない（Auth 有効時のみ表示）
- **FR-002**: 設定メニュー内にデフォルトモデル選択 UI（利用可能モデル一覧からのセレクト）を提供しなければならない
- **FR-003**: 既存ヘッダーのログアウトボタンを削除し、設定メニュー内にログアウトボタンを移動しなければならない
- **FR-004**: `GET /api/users/me/settings` を実装しなければならない（認証必須）。未保存時は `{ "userId": "<oid>", "settings": {} }` を返す（書き込みは行わない）
- **FR-005**: `PATCH /api/users/me/settings` を実装しなければならない（部分更新）。`defaultModel` は空文字でない string かつ modelCatalog 存在チェック（`hasModel`）を通過しなければならず、不正なら 400。`defaultModel: null` を指定した場合は設定を解除できる（settings からキー削除）。本文中の `id` / `userId` / ネストした `settings` オブジェクト等の予約キーは無視する。空の本文 `{}` は no-op の 200 とする
- **FR-006**: Cosmos DB に `userSettings` コンテナ（パーティションキー `/userId`）を追加しなければならない。ドキュメントは 1ユーザー1ドキュメントとし `id === userId`（パーティションキー点読み `item(userId, userId)`）。構造は `{ id, userId, settings, updatedAt }`
- **FR-007**: 設定APIへのアクセスは既存の `authenticateRequest` 由来の userId に限定され、他ユーザーの設定を参照・更新できてはならない。GET 時に保存済み `defaultModel` が modelCatalog に存在しない場合は応答から除外する（値の自動書き換えはしない）
- **FR-008**: 新規会話作成時にユーザーの `defaultModel` を適用しなければならない（未設定・無効・取得完了前の場合は従来どおり `DEFAULT_MODEL_ID`）。既存会話のモデルは変更しない
- **FR-009**: settings は拡張可能な JSON オブジェクト構造とし、今回追加するのは `defaultModel`（string）のみでなければならない
- **FR-010**: `infra/modules/cosmosdb.bicep` に `userSettings` コンテナの定義を追加しなければならない

### Non-Functional Requirements

- **NFR-001**: 既存の認証フロー・会話API・チャットAPIの挙動を変更してはならない
- **NFR-002**: 設定取得はログイン直後に1回だけ行い、チャット起動時間に顕著な影響を与えてはならない。ログアウト→再ログインのサイクルでは再取得する

### API Contract

```
GET /api/users/me/settings
→ 200 { "userId": "<oid>", "settings": { "defaultModel": "kimi-k2.6" }, "updatedAt": "..." }
   （未保存時は { "userId": "<oid>", "settings": {} }。id / updatedAt は省略）

PATCH /api/users/me/settings
body: { "defaultModel": "kimi-k2.6" } （部分更新・既知キーのみ。null で解除。id/userId 等の予約キーは無視、空本文は no-op）
→ 200 上記 GET と同形式 / 400 不正な defaultModel / 401 未認証 / 503 Cosmos DB 障害
```

## Success Criteria

### Measurable Outcomes

- **SC-001**: 設定メニューでデフォルトモデルを変更すると新規会話がそのモデルで作成される
- **SC-002**: 別ブラウザでログインすると前回の設定が復元される
- **SC-003**: `PATCH` は部分更新として動作し、不正な `defaultModel` は 400 になる
- **SC-004**: ヘッダーからログアウトボタンが消え、設定メニューからログアウトできる
- **SC-005**: 未認証リクエストは設定APIで 401 になる
- **SC-006**: `npm run build` / `npm test`（frontend と functions 両方）、`npm run lint`（frontend。functions に lint スクリプトはないため対象外）が成功し、今回差分に新規 lint 警告がない

## Out of Scope

- テーマ（ライト/ダーク/システム）設定 — バックログ初期項目にあるが今回は対応外
- 未認証時の localStorage フォールバック — バックログ受け入れ条件3を本仕様で削除
- 設定の履歴・同期競合制御（ETag 等）
- オフライン時の設定キャッシュ

## Assumptions

- 本番は常に Auth 有効のため、設定機能は Auth 有効時のみ提供する
- `defaultModel` の選択肢は `/api/models` と同じ modelCatalog 由来とする
- 設定コンテナは Bicep デプロイで作成する（手動作成は不要にする）
