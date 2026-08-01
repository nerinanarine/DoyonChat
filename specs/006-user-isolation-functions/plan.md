# Implementation Plan: ユーザー別会話分離と Azure Functions 移行

**Branch**: `[006-user-isolation-functions]` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

## Summary

P1-006のユーザー別会話分離と、P2-006のApp ServiceからAzure Functions Flex Consumptionへの移行を一つのリリースとして実装する。

実装は以下の順で進める。

1. Express側のユーザー分離を完成・検証する
2. 更新済みのサービス、認証、API契約をFunctionsへ移植する
3. Functions用のFlex ConsumptionインフラとCI/CDを追加する
4. ステージングで並行検証する
5. 本番のAPI URLをFunctionsへ切り替える
6. 安定稼働確認後にApp ServiceとApp Service Planを削除する

現在の作業ツリーでは、Express側のP1-006実装とテストが先行している。以下のPhase 1は、既存変更のレビュー・不足箇所の補完・最終検証を含む。

## Technical Context

**Current Backend**: Node.js 20, TypeScript, Express 4, esbuild, Jest

**Target Backend**: Node.js 20, TypeScript, `@azure/functions` v4, Azure Functions Runtime v4

**Target Hosting**: Azure Functions Flex Consumption（FC1）

**Database**: Azure Cosmos DB SQL API

- `conversations` partition key: `/id`
- `messages` partition key: `/conversationId`
- 既存アカウント、データベース、コンテナーを再利用

**Authentication**: Microsoft Entra ID JWT

- issuer検証
- audience検証
- JWKS署名検証
- `oid`を`userId`として使用
- `AUTH_ENABLED=false`では`dev-user`

**Frontend**: React + Vite。`VITE_API_URL`でAPI URLを切り替え、SSEは`fetch`のReadableStreamで受信する。

**External API**: OpenCode Go Chat Completions API。上流SSEをFunctionsから下流SSEへ転送する。

**Testing**: Jest（backend/functions）、Functions API契約テスト、Bicep構文検証、ステージングスモークテスト

**Constraints**:

- SSEのHTTP応答時間は約230秒以内を前提とする
- Cosmos DBのパーティションキーは変更しない
- 旧`userId`なしデータは削除しない
- 認証有効時、旧匿名データは一般ユーザーから非表示にする
- 本番切替後にApp ServiceとApp Service Planを削除する

## Design Decisions

### D1. Functionsは独立パッケージとする

`functions/`を新規作成し、Functions用の`package.json`、TypeScript設定、テストを持たせる。ExpressをFunctionsへアダプター経由で載せない。

**理由**:

- Functions v4のHTTP Streamsを直接利用できる
- Expressの`req`/`res`依存を明確に除去できる
- Functionsのローカル起動・デプロイ単位が明確になる
- 移行中は既存App Serviceをロールバック先として維持できる

初回移行では共通パッケージ化を行わず、必要なサービス・型・DB処理をFunctionsパッケージへ移植する。不要なモノレポ化・大規模リファクタリングは行わない。

### D2. Functionsの認証レベルはanonymousとする

Functionsの組み込みFunction Key認証は使用しない。HTTPトリガーは`authLevel: 'anonymous'`とし、アプリケーション層でEntra ID JWTを検証する。

**理由**: 現在のフロントエンドはEntra IDのBearer Tokenを送信しており、Function Keyを追加すると二重認証になるため。

### D3. ユーザー分離はサービス層とハンドラーの両方で守る

ルート／ハンドラーで認証ユーザーを取得し、サービス層にも`userId`を渡す。会話IDを受け取るサービスメソッドは、取得・更新・削除前に所有権を確認する。

### D4. Cosmos DBのパーティションキーを維持する

`/userId`への変更は行わず、既存コンテナーを再利用する。認証有効時の会話一覧は`userId`条件付きクロスパーティションクエリになる。

### D5. 旧匿名データは保持するが、認証有効時は非表示とする

旧データを削除したり、任意のEntra IDユーザーへ割り当てたりしない。`AUTH_ENABLED=false`のローカル開発では共有表示する。

### D6. App Serviceは切替確認後に削除する

インフラ追加時はApp ServiceとFunctionsを並行して作成する。本番SWAのAPI URLをFunctionsへ変更し、ログ・API・SSE・ユーザー分離を確認した後、App ServiceとApp Service Planを明示的に削除する。

### D7. Cosmos DB fallbackはローカル開発に限定する

`AUTH_ENABLED=false`のローカル開発では既存のin-memory fallbackを許可する。stagingと本番のFunctionsでは`COSMOSDB_REQUIRED=true`を設定し、Cosmos DBへ接続できない場合は会話系APIをエラーにする。複数Functionsインスタンス間でメモリデータを共有できないため、in-memoryをstaging・本番の永続化手段として扱わない。

## Project Structure

### Documentation

```text
specs/006-user-isolation-functions/
├── spec.md
└── plan.md
```

### Target Source Code

```text
functions/
├── host.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── .funcignore
├── local.settings.json.example
├── src/
│   ├── index.ts
│   ├── functions/
│   │   ├── health.ts
│   │   ├── models.ts
│   │   ├── conversations.ts
│   │   ├── messages.ts
│   │   └── chat.ts
│   ├── services/
│   │   ├── conversationService.ts
│   │   └── opencodeGo.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── errorHandler.ts
│   ├── db/
│   │   └── index.ts
│   └── types/
│       └── index.ts
└── tests/
    ├── unit/
    └── integration/
```

### Infrastructure Changes

```text
infra/
├── main.bicep                    # Functions module・出力・切替設定
├── main.json                     # 生成済みARMテンプレート
├── modules/
│   └── functions.bicep           # Flex Plan・Storage・Function App
└── parameters/
    ├── dev.parameters.json
    ├── staging.parameters.json
    └── prod.parameters.json
```

### Workflow Changes

```text
.github/workflows/
├── ci.yml                        # Functions変更検知・テスト追加
└── deploy.yml                    # Functionsデプロイ・API URL切替
```

## Implementation Phases

### Phase 0: 仕様・契約の固定

**Status**: 完了

- [x] P1-006/P2-006の統合仕様を作成
- [x] APIエンドポイントを確定
- [x] 旧匿名データの扱いを確定
- [x] Flex Consumption、本番切替、旧App Service削除を確定

**Verification**:

- [x] `spec.md`のAPI契約とバックログ個別仕様が一致する
- [x] Cosmos DBパーティションキーが変更されないことを明記する

### Phase 1: Express側のP1-006完成

**Status**: 作業ツリーで実装済み、検証継続

**Files**:

- `backend/src/types/index.ts`
- `backend/src/services/conversationService.ts`
- `backend/src/routes/conversations.ts`
- `backend/src/routes/chat.ts`
- `frontend/src/types/index.ts`
- `backend/tests/unit/conversationService.test.ts`
- `backend/tests/unit/conversationServiceLegacy.test.ts`
- `backend/tests/integration/conversations.test.ts`
- `backend/tests/integration/chat.test.ts`

**Tasks**:

- [x] Conversationに`userId`を追加
- [x] 新規会話へ認証ユーザーIDを保存
- [x] 会話一覧をuserIdで絞り込み
- [x] 詳細・メッセージ・チャット・モデル変更・削除の所有権チェック
- [x] 旧匿名データを認証有効時に非表示
- [x] 匿名開発モードの共有動作を維持
- [x] クライアント本文のuserIdを無視
- [x] ユーザー分離・旧データ・SSEの回帰テスト

**Verification**:

```bash
cd backend
npm run build
npm test -- --runInBand
```

### Phase 2: Functionsプロジェクトの作成

**Files**:

- `functions/package.json`
- `functions/tsconfig.json`
- `functions/host.json`
- `functions/.funcignore`
- `functions/local.settings.json.example`
- `functions/src/index.ts`
- `functions/src/functions/health.ts`
- `functions/src/types/index.ts`
- `functions/src/db/index.ts`

**Tasks**:

- [ ] `@azure/functions` v4とNode.js 20用の依存関係を定義
- [ ] TypeScriptの`rootDir`/`outDir`とFunctions v4のentry pointを定義
- [ ] `host.json`の`routePrefix: "api"`を設定
- [ ] `local.settings.json`からCosmos、OpenCode、Entra、CORS設定を読み込めるようにする
- [ ] `local.settings.json`本体をGit対象外にする
- [ ] 最小の`health.ts`を実装し、Functionsが起動直後からhealthを提供できるようにする
- [ ] `src/index.ts`で全Function登録と`app.setup({ enableHttpStream: true })`を行う
- [ ] Functions用DBクライアントを既存設定と同じ接続情報で実装

**Verification**:

```bash
cd functions
npm ci
npm run build
func start
curl http://localhost:7071/api/health
```

### Phase 3: Functionsサービス・認証の移植

**Files**:

- `functions/src/services/conversationService.ts`
- `functions/src/services/opencodeGo.ts`
- `functions/src/middleware/auth.ts`
- `functions/src/middleware/errorHandler.ts`
- `functions/src/types/index.ts`

**Tasks**:

- [ ] Express非依存のConversationサービスを移植
- [ ] `userId`スコープと旧匿名データ除外を移植
- [ ] `addMessage`時の会話所有権チェックを移植
- [ ] OpenCode Go上流SSEの読み取りを移植
- [ ] `HttpRequest`からBearer Tokenを抽出
- [ ] 既存と同じissuer、audience、JWKS、RS256ルールでJWTを検証
- [ ] `AUTH_ENABLED=false`の`dev-user`分岐を実装
- [ ] `COSMOSDB_REQUIRED=true`時はCosmos DB接続失敗でin-memory fallbackせず、会話系APIをエラーにする
- [ ] `COSMOSDB_REQUIRED=false`時だけローカル開発用in-memory fallbackを許可する
- [ ] 401、404、400、500のエラー形式を既存と合わせる

**Verification**:

- [ ] 有効トークンで`oid`が取得できる
- [ ] 無効・期限切れトークンが401になる
- [ ] 旧匿名データが認証有効時に取得できない
- [ ] ユーザーA/Bの所有権テストが通る
- [ ] 認証無効時に共有動作が通る

### Phase 4: Functions HTTPハンドラーの実装

**Files**:

- `functions/src/functions/health.ts`
- `functions/src/functions/models.ts`
- `functions/src/functions/conversations.ts`
- `functions/src/functions/messages.ts`
- `functions/src/functions/chat.ts`

**Tasks**:

- [ ] Phase 2の最小health Functionを正式なAPI契約・認証除外ルールとして検証する
- [ ] `GET /api/models`を認証付きFunctionとして登録
- [ ] 会話一覧・作成・詳細・削除・モデル変更を登録
- [ ] `GET /api/conversations/:id/messages`を登録
- [ ] `POST /api/chat`を登録
- [ ] すべての会話ID操作でuserIdをサービスへ渡す
- [ ] ルートパラメーター `{id}`を既存APIの`:id`と対応させる
- [ ] HTTPレスポンスのステータス・JSON形式を既存と合わせる

**Verification**:

- [ ] 全9エンドポイントのローカル契約テストが通る
- [ ] ルート競合がない
- [ ] health以外が認証必須である
- [ ] 他ユーザーの操作が404である

### Phase 5: Functions SSE実装

**Files**:

- `functions/src/functions/chat.ts`
- `functions/src/services/opencodeGo.ts`
- `functions/tests/unit/chat.test.ts`
- `functions/tests/integration/sse.test.ts`

**Tasks**:

- [ ] `app.setup({ enableHttpStream: true })`を有効化
- [ ] Functionsの`ReadableStream`へSSEイベントを書き込む
- [ ] `Content-Type`、`Cache-Control`、`Connection`を設定
- [ ] OpenCode Goのchunkを既存`content`イベントへ変換
- [ ] 完了時に`done:true`を送信
- [ ] ストリーム完了後にassistantメッセージを所有ユーザーとして保存
- [ ] OpenCode Goエラー時の既存エラーイベントを維持
- [ ] 最初のチャンク受信時刻、最終イベント受信時刻、総応答時間を計測できるようにする
- [ ] 230秒以内の応答をステージングで確認する
- [ ] heartbeatで230秒の総応答時間制約を回避しようとしない。必要性が判明した場合は、プロキシのアイドル対策として別途検証する

**Verification**:

- [ ] 最初のSSEチャンクを受信できる
- [ ] 最初のチャンク受信時刻（TTFT）を記録できる
- [ ] 複数chunkが順番どおり届く
- [ ] `done:true`が1回送信される
- [ ] 最終イベントと総応答時間を記録できる
- [ ] assistantメッセージがCosmos DBへ保存される
- [ ] frontend `chatApi.ts`を変更せずに受信できる

### Phase 6: Functionsテストとローカル契約テスト

**Files**:

- `functions/tests/unit/`
- `functions/tests/integration/`
- `functions/package.json`
- 必要に応じて `frontend/tests/`

**Tasks**:

- [ ] ハンドラー単体テストを追加
- [ ] 認証・所有権・旧匿名データのテストを追加
- [ ] 全APIのHTTP契約テストを追加
- [ ] SSEストリームの契約テストを追加
- [ ] Cosmos DBとOpenCode Goをモック化
- [ ] `func start`を使ったローカルスモーク手順を整備
- [ ] 既存ExpressとFunctionsのレスポンス差分を確認

**Verification**:

```bash
cd functions
npm test
npm run build
func start
```

### Phase 7: Flex Consumptionインフラ

**Files**:

- `infra/modules/functions.bicep`
- `infra/main.bicep`
- `infra/main.json`
- `infra/parameters/dev.parameters.json`
- `infra/parameters/staging.parameters.json`
- `infra/parameters/prod.parameters.json`

**Tasks**:

- [ ] Flex Consumption用サーバーファーム（FC1）を定義
- [ ] Functions用Storage Accountを定義
- [ ] Node.js 20のFunction Appを定義
- [ ] Function Appのsystem settingsとアプリ設定を定義
- [ ] `COSMOSDB_REQUIRED`をFunctionsの環境別設定として定義し、staging/本番では`true`にする
- [ ] `entraTenantId`、`entraApiClientId`、`authEnabled`を安全なデプロイパラメーターまたはEnvironment Variablesから渡す
- [ ] Cosmos DBモジュールのendpoint/keyをFunctionsへ渡す
- [ ] App Insights接続を設定
- [ ] Static Web App URLをCORS許可する
- [ ] Function App URLと名前をdeployment outputに追加する
- [ ] 切替完了まで参照するlegacy App Service名とApp Service Plan名も出力または安全に取得できるようにする
- [ ] App ServiceとFunctionsを移行期間中は共存させる
- [ ] `az bicep build`で`main.json`を更新する

**Verification**:

```bash
az bicep build --file infra/main.bicep --outfile /tmp/main.json
az deployment group validate \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters infra/parameters/staging.parameters.json
```

### Phase 8: CI/CD更新

**Files**:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `README.md`
- `specs/001-chat-app/quickstart.ja.md`
- `specs/005-entra-id-auth/setup-guide.md`
- `frontend/.env.example`

**Tasks**:

- [ ] `functions/**`変更をCIの変更検知に追加
- [ ] FunctionsのNode.jsセットアップ、npm cache、npm ci、build、testを追加
- [ ] Functions用Bicep変更の検証を追加
- [ ] deploy-infraのoutputsからFunction App名・URLを取得
- [ ] Functions用パッケージをビルドしてFlex対応方式でデプロイ
- [ ] Functionsデプロイ方式は`Azure/functions-action@v1`に統一し、Flex ConsumptionのOne Deployを使用する
- [ ] Functions用のビルド済みパッケージ（`host.json`、コンパイル済み`dist`、本番依存関係、`package.json`）を作成する
- [ ] 現行の`azure/login@v2` + `AZURE_CREDENTIALS`を当面継続し、publish profileを新たに導入しない
- [ ] stagingでActionのFlex用パラメーター、パッケージ構成、認証コンテキストを検証する
- [ ] フロントエンドビルドの`VITE_API_URL`をFunctions URLに変更
- [ ] App Serviceデプロイを切替完了まで保持
- [ ] Functionsヘルスチェックまたはスモークテストを追加
- [ ] ローカルFunctions起動・環境変数・本番切替手順をドキュメント化

**Verification**:

- [ ] YAML構文検証が通る
- [ ] Functions変更PRでFunctionsテストが実行される
- [ ] staging環境へFunctionsをデプロイできる
- [ ] SWAのビルド成果物にFunctions URLが埋め込まれる

### Phase 9: ステージング並行検証

**Prerequisites**:

- [ ] staging用のEntra IDテナントとAPIアプリ登録が利用可能
- [ ] staging用の`ENTRA_TENANT_ID`、`ENTRA_API_CLIENT_ID`、SPAの`ENTRA_CLIENT_ID`をGitHub Environment Variablesへ登録
- [ ] stagingのSWAリダイレクトURIとAPI audienceをEntra ID側に登録
- [ ] staging用のテストユーザーを2つ以上用意し、ユーザーA/Bの分離を検証できる
- [ ] `staging.parameters.json`のプレースホルダーを解消するか、デプロイ時に安全に注入する
- [ ] Entra IDの秘密値、Cosmos DBキー、OpenCode Go APIキーをリポジトリへ保存しない

**Tasks**:

- [ ] 同じCosmos DBを参照するFunctionsをデプロイ
- [ ] health、models、conversation CRUDを検証
- [ ] Entra IDの有効トークン・無効トークンを検証
- [ ] ユーザーA/Bの会話分離を検証
- [ ] 旧匿名データの非表示を検証
- [ ] チャットSSEとassistant保存を検証
- [ ] 230秒制約とコールドスタートを計測
- [ ] フロントエンドをFunctions URLで動かす
- [ ] Cosmos DBの既存データ・パーティションキーを確認

**Exit Criteria**:

- [ ] 全API契約テスト成功
- [ ] SSE成功
- [ ] ユーザー分離成功
- [ ] 既存データ保持確認
- [ ] Functionsのエラー・レイテンシーが許容範囲

### Phase 10: 本番切替と旧リソース削除

本番切替と旧リソース削除は同じpushデプロイに含めない。旧リソース削除は、手動実行・承認付きのcleanup工程とする。

**Tasks**:

- [ ] 本番Functionsをデプロイ
- [ ] 本番Functionsでhealth、認証、ユーザー分離、SSEを確認
- [ ] `VITE_API_URL`をFunctions URLへ変更してSWAをデプロイ
- [ ] 本番SWAからFunctionsへAPI通信できることを確認
- [ ] App Serviceへの新規アクセスがないことを確認
- [ ] ロールバック期間を設けてFunctionsログを監視
- [ ] `workflow_dispatch`に`delete-legacy-appservice`入力を追加し、既定値を`false`にする
- [ ] `prod-cleanup` GitHub Environmentに承認ルールを設定する
- [ ] cleanup実行前に対象App Service名・Plan名、依存する他リソース、最終バックアップを確認する
- [ ] cleanup実行前に`az deployment group what-if`と対象リソース一覧を保存する
- [ ] 承認後に旧App Serviceを`az webapp delete`で削除する
- [ ] App Service Planが他リソースで使用されていないことを確認してから削除する
- [ ] App Service Planを`az appservice plan delete`で削除する
- [ ] 削除成功後、Bicep・workflow・README・環境変数から旧App Service参照を削除する
- [ ] `az deployment group what-if`で不要リソースが残っていないことを確認する

**Exit Criteria**:

- [ ] 本番SWAがFunctions URLを使用
- [ ] 主要APIが本番で正常
- [ ] ユーザー分離が本番で正常
- [ ] cleanupが手動承認付きで成功
- [ ] 旧App ServiceとApp Service Planが削除済み
- [ ] Cosmos DB、SWA、Functionsが稼働中

## Dependency Graph

```text
Phase 0 仕様確定
   │
   ├── Phase 1 Express P1-006
   │       │
   │       └── Phase 3 Functions service/auth
   │               ├── Phase 4 HTTP handlers
   │               └── Phase 5 SSE
   │                       └── Phase 6 Functions tests
   │
   ├── Phase 2 Functions skeleton
   │       └── Phase 3
   │
   └── Phase 7 Flex infrastructure
           └── Phase 8 CI/CD
                   └── Phase 9 staging
                           └── Phase 10 production cutover/delete
```

## Test Strategy

### Unit Tests

外部サービスをモック化し、以下をテストする。

- userIdによる一覧フィルター
- 所有権違反の404相当結果
- 旧匿名データ除外
- `AUTH_ENABLED=false`の共有
- JWT検証結果のユーザーID抽出
- SSEイベント変換
- エラー形式

### API Contract Tests

ExpressとFunctionsで同一のリクエストを実行し、以下を比較する。

- パスとHTTPメソッド
- ステータスコード
- JSONレスポンスの形
- 認証エラー
- 所有権エラー
- CORSヘッダー
- SSEヘッダーとイベント形式

### Streaming Performance Tests

- OpenCode Goをモックし、複数chunkを一定間隔で返す
- 最初のchunk受信までのTTFTを計測する
- `done:true`受信までの総応答時間を計測する
- stagingでは通常応答が約230秒以内に完了することを確認する
- heartbeatを追加しても230秒の総応答時間制約を延長できないことを前提にする
- 230秒を超える処理をサポートする仕様変更は別タスクにする

### Data Safety Tests

- 既存`userId`なしConversationを削除しない
- 同じCosmos DB endpoint/database/containerを参照する
- partition key `/id`、`/conversationId`を変更しない
- Functionsのin-memory fallbackを本番永続化の代替として扱わない

## Deployment and Rollback

### Staging

- App Serviceを維持したままFunctionsを追加
- Functions専用URLで契約・SSE・認証を検証
- フロントエンドを一時的にFunctions URLへ向けて検証

### Production Cutover

1. Functionsインフラ・コードをデプロイ
2. Functions health、認証、会話分離、SSEを検証
3. `VITE_API_URL`をFunctions URLに変更
4. SWAをデプロイ
5. 本番トラフィックとログを確認
6. ロールバック期間はApp Serviceを保持
7. 問題がないことを確認してApp ServiceとPlanを削除

### Rollback Before Deletion

- `VITE_API_URL`を旧App Service URLへ戻してSWAを再ビルド・再デプロイ
- App Serviceの稼働を確認
- Functionsの原因調査

### Rollback After Deletion

App Service削除後は旧ホストへの即時ロールバックを行わない。必要な場合はFunctionsの修正デプロイを行う。削除前に最終バックアップ・設定記録を保存する。

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| FunctionsのHTTP StreamsとSSEの差異 | `enableHttpStream`を有効化し、ローカル・ステージングでfetch SSEを検証 |
| Flex Consumptionのデプロイ方式差異 | `Azure/functions-action@v1`に統一し、Flex ConsumptionのOne Deployとしてstagingで実証 |
| コールドスタート | stagingで初回TTFTを計測し、許容範囲を確認 |
| Cosmos DBのクロスパーティションクエリ | パーティションキーを変更せず、userId条件を付与。トラフィックを監視 |
| 旧匿名データの扱い | 削除・自動移管せず、認証有効時は非表示 |
| 認証ルールの二重実装 | issuer/audience/JWKS/oidの契約テストをExpress/Functions共通で実行 |
| 切替後の旧URL参照 | ビルド成果物、workflow、env、READMEを検索して確認 |
| App Service削除によるロールバック不能 | 本番切替確認と監視期間の後、手動承認付きcleanupで削除 |
| FunctionsへのCosmos接続失敗 | staging/本番は`COSMOSDB_REQUIRED=true`としてin-memory fallbackを禁止 |
| staging認証設定不足 | 2テストユーザー、SPA/APIアプリ登録、redirect URIをPhase 9の前提にする |
| Functionsデプロイ方式の不一致 | `Azure/functions-action@v1` + Flex One Deployに統一し、stagingで実証 |

## Deliverables

- [ ] `specs/006-user-isolation-functions/spec.md`
- [ ] `specs/006-user-isolation-functions/plan.md`
- [ ] Express側P1-006実装とテスト
- [ ] `functions/`プロジェクト
- [ ] Functions API・認証・SSE実装とテスト
- [ ] Flex Consumption Bicep
- [ ] CI/CD更新（Functions Actionによるデプロイを含む）
- [ ] 手動承認付きlegacy cleanup工程
- [ ] ローカル・ステージング・本番切替手順
- [ ] App Service / App Service Plan削除
- [ ] 関連README・セットアップガイド更新
