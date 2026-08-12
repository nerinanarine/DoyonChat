# Feature Specification: ユーザー別会話分離と Azure Functions 移行

**Feature Branch**: `[006-user-isolation-functions]`

**Created**: 2026-08-02

**Status**: Draft

**Input**: "P1-006のユーザー別会話分離と、P2-006のAzure Functions Flex Consumptionへのバックエンド移行を同一リリースで実装する。Functionsへ本番切替後、旧App ServiceとApp Service Planを削除する。"

## User Scenarios & Testing

### User Story 1 - ユーザーごとの会話分離 (Priority: P1)

Entra IDでログインしたユーザーは、自分が作成した会話だけを一覧表示・閲覧・変更・削除できる。他のユーザーの会話IDを直接指定しても、会話の存在を知ることはできない。

**Why this priority**: 認証後に会話を共有すると、ユーザー間の機密情報が漏洩するため。本番切替の必須条件とする。

**Independent Test**: 2つのユーザーIDを使って会話を作成し、一覧・詳細・メッセージ・チャット・モデル変更・削除の各操作を相互に実行してアクセスが分離されることを確認できる。

**Acceptance Scenarios**:

1. **Given** ユーザーAがログインしている状態、**When** 会話を作成する、**Then** JWTの`oid`を`userId`として会話に保存する
2. **Given** ユーザーAとユーザーBがそれぞれ会話を持つ状態、**When** ユーザーAが会話一覧を取得する、**Then** ユーザーAの会話だけが返る
3. **Given** ユーザーAの会話IDをユーザーBが知っている状態、**When** ユーザーBが詳細取得、メッセージ取得、チャット送信、モデル変更、削除のいずれかを行う、**Then** `404 Not Found` が返る
4. **Given** クライアントがリクエスト本文に別の`userId`を含めた状態、**When** 会話を作成する、**Then** リクエスト本文の値は無視され、認証済みユーザーの`oid`が保存される
5. **Given** ユーザーAがログアウトしユーザーBでログインした状態、**When** 会話一覧を表示する、**Then** ユーザーAの会話は表示されない
6. **Given** `AUTH_ENABLED=false`のローカル開発状態、**When** 会話一覧や会話操作を行う、**Then** `dev-user`として従来どおり会話を共有できる

### User Story 2 - 既存 API の Azure Functions 移行 (Priority: P1)

フロントエンドの API クライアントを変更せず、API の接続先を Functions の URL に変更するだけで既存機能を利用できる。

**Why this priority**: 移行によるユーザー向けの機能変更と回帰を避け、ホスティングだけを置き換えるため。

**Independent Test**: ローカルの `func start` またはステージング環境に対して、既存の全 API の HTTP メソッド、パス、ステータスコード、レスポンス形式を検証できる。

**Acceptance Scenarios**:

1. **Given** Functions が起動している状態、**When** `GET /api/health` を認証なしで呼び出す、**Then** 200とstatus/timestampが返る
2. **Given** 有効な認証トークンがある状態、**When** 会話・モデル APIを呼び出す、**Then** Express版と同じJSON形式とステータスコードが返る
3. **Given** 認証トークンがない、または無効な状態、**When** health以外のAPIを呼び出す、**Then** 401が返る
4. **Given** 他ユーザーの会話IDを指定した状態、**When** 会話APIを呼び出す、**Then** 404が返る

### User Story 3 - Functions 上の SSE ストリーミング (Priority: P1)

ユーザーがチャットを送信すると、FunctionsからOpenCode Goの応答がSSEで逐次返され、既存フロントエンドにリアルタイム表示される。

**Why this priority**: ストリーミングはチャットの主要機能であり、移行で失われると実用性がなくなるため。

**Independent Test**: `POST /api/chat` のレスポンスヘッダー、複数チャンク、最終完了イベント、assistantメッセージ保存を確認できる。

**Acceptance Scenarios**:

1. **Given** 所有権のある会話でチャットを送信した状態、**When** FunctionsがOpenCode Goへ接続する、**Then** `text/event-stream`レスポンスが返る
2. **Given** SSE応答中の状態、**When** フロントエンドがレスポンスを読み取る、**Then** 既存形式の`done:false`イベントを逐次受信できる
3. **Given** OpenCode Goの応答が完了した状態、**When** Functionsが処理を終了する、**Then** `done:true`イベントが送信され、assistantメッセージが保存される
4. **Given** 応答が約230秒以内に完了する状態、**When** チャットを送信する、**Then** AzureのHTTP応答時間制約内で完了する
5. **Given** 他ユーザーの会話でチャットを送信した状態、**When** Functionsがリクエストを処理する、**Then** OpenCode Goへ接続せず404を返す

### User Story 4 - サーバーレス環境への切替 (Priority: P1)

運用者は、App ServiceとFunctionsを並行検証した後、フロントエンドの接続先をFunctionsへ切り替え、旧App ServiceとApp Service Planを削除できる。

**Why this priority**: コスト削減を実現しつつ、切替失敗時の影響を制御するため。

**Independent Test**: ステージング検証、本番フロントエンドのAPI URL変更、Functionsの正常性確認、旧リソース削除を順番に実行できる。

**Acceptance Scenarios**:

1. **Given** Functionsのインフラが追加された状態、**When** 既存App Serviceと並行してデプロイする、**Then** 両方が同じCosmos DBを参照する
2. **Given** ステージングで全API・認証・ユーザー分離・SSEが検証済みの状態、**When** 本番フロントエンドをデプロイする、**Then** `VITE_API_URL`がFunctionsのAPI URLを指す
3. **Given** 本番フロントエンドがFunctionsを利用している状態、**When** Functionsの正常性とログを確認する、**Then** App Serviceへの新規APIアクセスが不要になる
4. **Given** 本番切替が確認済みの状態、**When** 旧リソースを削除する、**Then** App ServiceとApp Service Planが削除され、Cosmos DB・SWA・Functionsは維持される

### User Story 5 - ローカル開発とCI/CD (Priority: P2)

開発者はFunctionsをローカルで起動・テストでき、Pull Requestとmainブランチのワークフローでビルド・テスト・デプロイを実行できる。

**Independent Test**: Functionsディレクトリでビルド後に`func start`を実行し、health APIと契約テストを実行できる。CIではFunctionsの変更を検知してテストできる。

**Acceptance Scenarios**:

1. **Given** Node.js 20とAzure Functions Core Toolsがインストールされた状態、**When** `functions`でビルド後に`func start`を実行する、**Then** Functionsがローカルの7071番ポートで起動する
2. **Given** Functionsコードを変更したPR、**When** CIが起動する、**Then** Functionsの依存関係インストール、ビルド、テストが実行される
3. **Given** mainブランチへのデプロイが実行された状態、**When** インフラ・Functions・フロントエンドのジョブが完了する、**Then** FunctionsへデプロイされたAPI URLでSWAが動作する

## Edge Cases

- **旧匿名データ**: `userId`がない既存会話は削除しない。`AUTH_ENABLED=true`では一覧・詳細・メッセージ・チャット操作の対象外とし、`AUTH_ENABLED=false`では従来どおり共有する
- **認証情報なし**: `/api/health`以外は401を返す
- **所有権違反**: 404を返し、会話の存在を漏らさない
- **本文のuserId改ざん**: クライアントの`userId`は無視し、JWTの`oid`だけを利用する
- **Cosmos DB接続失敗**: ローカル開発では既存のin-memory fallbackを許可する。staging・本番のFunctionsではCosmos DB接続を必須とし、接続できない場合は会話系APIをエラーにする
- **OpenCode Goエラー**: 既存のSSEエラーイベント・assistant保存の挙動を維持する
- **コールドスタート**: 初回リクエストの遅延をステージングで計測する
- **230秒超過**: 長時間処理用のポーリングやWebSocketへの変更は本機能に含めない
- **切替中のロールバック**: 本番切替確認が完了するまでApp Serviceを削除しない
- **App Service削除後の参照**: ワークフロー、README、環境変数、SWAビルドに旧App Service URLが残っていないことを確認する

## Requirements

### Functional Requirements

- **FR-001**: システムは認証済みJWTの`oid`を新規Conversationの`userId`として保存する
- **FR-002**: システムはクライアントから送信された`userId`を認証情報として使用しない
- **FR-003**: 認証有効時、会話一覧は現在のユーザーの`userId`で絞り込む
- **FR-004**: 認証有効時、会話IDを受け取る全操作で所有権を検証する
- **FR-005**: 所有権がない会話、または`userId`のない旧匿名会話への操作は404を返す
- **FR-006**: `AUTH_ENABLED=false`では`dev-user`として会話を共有できる
- **FR-007**: Functionsは以下の既存APIを提供する
  - `GET /api/health`
  - `GET /api/models`
  - `GET /api/conversations`
  - `POST /api/conversations`
  - `GET /api/conversations/:id`
  - `DELETE /api/conversations/:id`
  - `PUT /api/conversations/:id/model`
  - `GET /api/conversations/:id/messages`
  - `POST /api/chat`
- **FR-008**: `GET /api/health`を除くAPIはEntra ID JWT認証を要求する
- **FR-009**: Functionsは既存のSSEイベント形式を維持する
- **FR-010**: Functionsは既存のCosmos DBアカウント、データベース、コンテナーを再利用する
- **FR-011**: `conversations`の`/id`、`messages`の`/conversationId`パーティションキーを変更しない
- **FR-012**: FunctionsはNode.js v4プログラミングモデルとHTTP Streamsを使用する
- **FR-013**: ローカルで`func start`により起動できる
- **FR-014**: CI/CDはFunctionsのビルド・テスト・Flex Consumptionデプロイに対応する
- **FR-015**: 本番切替後にApp ServiceとApp Service Planを削除する
- **FR-016**: 本番切替時にCosmos DB、Static Web App、Functionsのデータとリソースを維持する

### API Contract

| Method | Path | Auth | Success | 備考 |
|---|---|---|---|---|
| GET | `/api/health` | 不要 | 200 | `{ status, timestamp }` |
| GET | `/api/models` | 必須 | 200 | モデル配列 |
| GET | `/api/conversations` | 必須 | 200 | userIdで絞り込み |
| POST | `/api/conversations` | 必須 | 201 | userIdをJWTから設定 |
| GET | `/api/conversations/:id` | 必須 | 200 | 会話とメッセージ |
| DELETE | `/api/conversations/:id` | 必須 | 204 | 所有権確認 |
| PUT | `/api/conversations/:id/model` | 必須 | 200 | 所有権確認 |
| GET | `/api/conversations/:id/messages` | 必須 | 200 | 所有権確認 |
| POST | `/api/chat` | 必須 | 200 | `text/event-stream` |

共通エラー:

```json
{
  "error": "Conversation not found"
}
```

### SSE Contract

```text
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"content":"...","done":false}

data: {"content":"","done":true}
```

### Key Entities

#### Conversation

```json
{
  "id": "uuid-string",
  "userId": "entra-object-id-string",
  "title": "New Chat",
  "model": "kimi-k2.6",
  "createdAt": "2026-08-02T00:00:00Z",
  "updatedAt": "2026-08-02T00:00:00Z"
}
```

新規データでは`userId`を必須とする。旧匿名データとの互換性のため、読み取り型では`userId`なしを許容する。

#### Message

`conversationId`でConversationへ関連付ける。Messageには`userId`を追加しない。会話の所有権確認後にのみMessageへアクセスする。

## Infrastructure and Configuration

### Target Architecture

```text
┌────────────────────┐
│ Azure Static Web App│
│ React + Vite        │
└─────────┬──────────┘
          │ HTTPS / Bearer / fetch SSE
┌─────────▼────────────────────┐
│ Azure Functions               │
│ Node.js 20 / v4              │
│ Flex Consumption / HTTP      │
└──────┬─────────────┬─────────┘
       │             │
       │             └── OpenCode Go API
       │
┌──────▼──────────┐   ┌─────────────┐
│ Azure Cosmos DB │   │ Entra ID/JWKS│
│ existing data   │   │ token verify │
└─────────────────┘   └─────────────┘
```

移行中は旧App Serviceも一時的に存在する。SWAのAPI URLをFunctionsへ切り替え、正常性確認後に旧App ServiceとApp Service Planを削除する。

### Required Settings

- `FUNCTIONS_WORKER_RUNTIME=node`
- `FUNCTIONS_EXTENSION_VERSION=~4`
- `COSMOSDB_ENDPOINT`
- `COSMOSDB_KEY`
- `COSMOSDB_DATABASE`
- `OPENCODE_GO_API_KEY`
- `OPENCODE_GO_MODEL`
- `AUTH_ENABLED`
- `ENTRA_TENANT_ID`
- `ENTRA_API_CLIENT_ID`
- `FRONTEND_URL`
- `COSMOSDB_REQUIRED`（ローカルはfalse、staging・本番はtrue）
- Functions実行・デプロイ用Storage設定
- Application Insights接続設定

## Non-Functional Requirements

- **Security**: ユーザーIDはJWTの`oid`からのみ決定し、所有権違反で会話の存在を漏らさない
- **Compatibility**: フロントエンドのAPI呼び出しコードを変更せず、APIベースURLの変更だけで移行できる
- **Data safety**: 既存Cosmos DBデータとコンテナーを削除・再作成しない
- **Operational safety**: ステージング検証と本番切替確認を旧リソース削除より先に行う
- **Runtime**: Node.js 20、Functions Runtime v4、Functions programming model v4
- **Streaming**: 通常のチャット応答は約230秒以内に完了する前提とする

## Success Criteria

- **SC-001**: ユーザーA/Bのテストで、他ユーザーの会話に対する全操作が404になる
- **SC-002**: 旧`userId`なしデータが削除されず、認証有効時の一般ユーザーAPIから返らない
- **SC-003**: Functionsの全9 APIエンドポイントが契約テストを通過する
- **SC-004**: `POST /api/chat`で最初のSSEチャンクと`done:true`を受信できる
- **SC-005**: 通常のSSE応答が約230秒以内に完了する
- **SC-006**: `npm run build`、単体テスト、Functions API契約テスト、Bicepビルドが成功する
- **SC-007**: `func start`でローカルFunctionsを起動し、health APIが200を返す
- **SC-008**: 本番SWAのAPI通信先がFunctions URLになっている
- **SC-009**: 本番切替後に旧App ServiceとApp Service Planが削除され、Cosmos DB・SWA・Functionsが稼働している

## Out of Scope

- 230秒を超える長時間処理のためのポーリング・WebSocket化
- Cosmos DBのパーティションキーを`/userId`へ変更するデータ移行
- 旧匿名データを特定ユーザーへ自動移管する機能
- P2-007で扱う一般的なCI/CD整理・未使用Secret削除
- チャットUIやMarkdown表示などのユーザー向け機能変更
- P1-003のストリーミング中断時の部分保存

## Assumptions

- P1-005のEntra ID認証設定は利用可能である
- Entra IDの`oid`をアプリケーション上のユーザー識別子として利用する
- Functions用のStorage Accountを新規作成できる
- 既存Cosmos DBの接続情報とデータを引き続き利用できる
- `AUTH_ENABLED=false`はローカル開発用であり、本番は認証有効とする
- Azure Functions Core Tools v4がローカルまたはCIで利用可能である
