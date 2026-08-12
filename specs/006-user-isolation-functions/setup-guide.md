# ユーザー別会話分離・Azure Functions 移行 セットアップガイド

## 概要

このガイドでは、以下の統合機能をローカル・staging・本番で利用するための設定手順を説明します。

- P1-006: Entra IDユーザーごとの会話分離
- P2-006: Express / App ServiceからAzure Functions Flex Consumptionへの移行
- `POST /api/chat` のSSEストリーミング
- 本番切替後の旧App Service / App Service Plan削除

詳細な仕様と実装計画:

- [spec.md](./spec.md)
- [plan.md](./plan.md)
- [P1-006個別仕様](../000_backlog/items/P1-006-user-separated-chats.md)
- [P2-006個別仕様](../000_backlog/items/P2-006-functions-migration.md)

---

## 1. 前提条件

### 必要なツール

| ツール | 推奨バージョン | 確認コマンド |
|--------|---------------|--------------|
| Node.js | 20 LTS | `node --version` |
| npm | 10以上 | `npm --version` |
| Azure Functions Core Tools | v4 | `func --version` |
| Azure CLI | 2.50以上 | `az version` |
| curl | 最新版 | `curl --version` |
| jq | 1.6以上 | `jq --version` |

### Azureリソース

既存環境では以下のリソースを使用します。

- Azure Cosmos DB
- Azure Static Web Apps
- Application Insights
- Log Analytics Workspace

Bicepは以下を新規作成します。

- Flex Consumption用サーバーファーム
- Azure Function App
- Functions用Storage Account
- Functionsデプロイ用Blob Container

Functions用Storage Accountは、Bicepが作成するため事前作成不要です。

### GitHub権限

CI/CDを設定する場合は、以下が必要です。

- GitHubリポジトリのActions実行権限
- GitHub EnvironmentsのSecrets / Variables編集権限
- `prod-cleanup` EnvironmentのRequired reviewers設定権限

---

## 2. リポジトリのセットアップ

```bash
git clone https://github.com/nerinanarine/DoyonChat.git
cd DoyonChat

# Functions
cd functions
npm ci
cd ..

# 既存Expressバックエンド（互換検証用）
cd backend
npm ci
cd ..

# フロントエンド
cd frontend
npm ci
cd ..
```

Functionsのローカル設定ファイルは、テンプレートから作成します。

```bash
cp functions/local.settings.json.example functions/local.settings.json
```

Windows PowerShellの場合:

```powershell
Copy-Item functions/local.settings.json.example functions/local.settings.json
```

`functions/local.settings.json` は機密情報を含むため、Gitへコミットしないでください。

---

## 3. ローカル環境変数

### 3.1 Functions設定

`functions/local.settings.json` の `Values` を設定します。

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "FUNCTIONS_EXTENSION_VERSION": "~4",
    "COSMOSDB_ENDPOINT": "https://<account>.documents.azure.com:443/",
    "COSMOSDB_KEY": "<primary-key>",
    "COSMOSDB_DATABASE": "chatdb",
    "COSMOSDB_REQUIRED": "false",
    "OPENCODE_GO_API_KEY": "sk-opencode-your-key-here",
    "OPENCODE_GO_MODEL": "kimi-k2.6",
    "AUTH_ENABLED": "false",
    "ENTRA_TENANT_ID": "<tenant-id>",
    "ENTRA_API_CLIENT_ID": "<api-client-id>",
    "FRONTEND_URL": "http://localhost:5173"
  },
  "Host": {
    "LocalHttpPort": 7071,
    "CORS": "http://localhost:5173"
  }
}
```

| 設定 | ローカル | staging / 本番 |
|------|----------|----------------|
| `AUTH_ENABLED` | `false` または `true` | `true`を推奨 |
| `COSMOSDB_REQUIRED` | `false` | `true` |
| `FRONTEND_URL` | `http://localhost:5173` | 対象SWAのHTTPS URL |
| `AzureWebJobsStorage` | Azuriteまたは接続文字列 | Bicepが作成するStorage設定 |

`COSMOSDB_REQUIRED=false` の場合だけ、Cosmos DB接続失敗時にローカルのin-memory fallbackを使用します。staging・本番では必ず `true` にしてください。

### 3.2 認証無効の開発モード

最初にFunctionsのAPI動作だけを確認する場合は、以下を設定します。

```json
{
  "AUTH_ENABLED": "false",
  "COSMOSDB_REQUIRED": "false"
}
```

このモードでは、すべてのリクエストが `dev-user` として扱われます。リクエスト本文に `userId` を含めても、その値は使用されません。

### 3.3 Entra ID認証有効モード

Entra IDを有効にする場合は、以下を設定します。

```json
{
  "AUTH_ENABLED": "true",
  "ENTRA_TENANT_ID": "<tenant-id>",
  "ENTRA_API_CLIENT_ID": "<api-client-id>",
  "COSMOSDB_REQUIRED": "false"
}
```

フロントエンド側の `frontend/.env.local`:

```env
VITE_AUTH_ENABLED=true
VITE_ENTRA_CLIENT_ID=<spa-client-id>
VITE_ENTRA_API_CLIENT_ID=<api-client-id>
VITE_ENTRA_TENANT_ID=<tenant-id>
VITE_ENTRA_REDIRECT_URI=http://localhost:5173
VITE_API_URL=http://localhost:7071/api
```

`ENTRA_API_CLIENT_ID` はAPIアプリ登録のクライアントID、`VITE_ENTRA_CLIENT_ID` はSPAアプリ登録のクライアントIDです。

---

## 4. ローカル起動

### 4.1 Functions

```bash
cd functions
npm run build
func start
```

起動後、Functionsのエンドポイントは以下です。

```text
http://localhost:7071/api
```

Functions Core Toolsの一覧に、以下の7 Functionが表示されることを確認します。

```text
chat
conversation
conversation-messages
conversation-model
conversations
health
models
```

### 4.2 フロントエンド

別ターミナルで実行します。

```bash
cd frontend
npm run dev
```

ブラウザで以下を開きます。

```text
http://localhost:5173
```

### 4.3 旧Expressバックエンドとの切替

旧Expressバックエンドを比較用に起動する場合:

```bash
cd backend
npm run dev
```

その場合、フロントエンドの `VITE_API_URL` を以下に変更します。

```env
VITE_API_URL=http://localhost:3000/api
```

通常のFunctions移行検証では、`http://localhost:7071/api` を使用します。

---

## 5. ローカルAPI確認

### 5.1 Health

```bash
curl http://localhost:7071/api/health
```

期待値:

```json
{
  "status": "ok",
  "timestamp": "2026-08-02T00:00:00.000Z"
}
```

`/api/health` だけは認証不要です。

### 5.2 Models

認証無効モードの場合:

```bash
curl http://localhost:7071/api/models
```

認証有効モードでBearer Tokenを使用する場合:

```bash
curl http://localhost:7071/api/models \
  -H "Authorization: Bearer <access-token>"
```

### 5.3 会話作成

認証無効モード:

```bash
curl -X POST http://localhost:7071/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title":"Functions chat","model":"kimi-k2.6","userId":"spoofed-user"}'
```

レスポンスの `userId` は `dev-user` になります。本文の `spoofed-user` は信頼されません。

### 5.4 会話・メッセージAPI

```bash
# 会話一覧
curl http://localhost:7071/api/conversations

# 会話詳細
curl http://localhost:7071/api/conversations/<conversation-id>

# メッセージ一覧
curl http://localhost:7071/api/conversations/<conversation-id>/messages

# モデル変更
curl -X PUT http://localhost:7071/api/conversations/<conversation-id>/model \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5.1"}'

# 会話削除
curl -i -X DELETE http://localhost:7071/api/conversations/<conversation-id>
```

### 5.5 SSEチャット

```bash
curl -N -X POST http://localhost:7071/api/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"<conversation-id>","message":"Hello"}'
```

期待されるイベント形式:

```text
data: {"content":"...","done":false}

data: {"content":"","done":true}
```

Functionsログに以下の計測値が出力されます。

```text
[functions/chat] TTFT=...
[functions/chat] stream completed in ...ms
```

### 5.6 認証エラー

```bash
# health以外は認証有効時に401
curl -i http://localhost:7071/api/models
```

他ユーザーの会話IDを指定した場合は、会話の存在を漏らさないため `404` になります。

---

## 6. テスト・ビルド

### Functions

```bash
cd functions
npm ci
npm run build
npm test -- --runInBand
```

現在のテスト対象:

- health handler
- JWT認証、oid抽出、期限切れトークン
- userIdによる会話分離
- 旧匿名データの非表示
- `COSMOSDB_REQUIRED` のエラー動作
- 全HTTPハンドラーの契約
- SSEイベントとassistant保存

### Backend

```bash
cd backend
npm run build
npm test -- --runInBand
```

### Frontend

```bash
cd frontend
npm run build
npm test
```

---

## 7. Bicep検証

### 構文検証

```bash
az bicep build \
  --file infra/main.bicep \
  --outfile /tmp/doyonchat-main.json
```

Windows PowerShell:

```powershell
az bicep build `
  --file infra/main.bicep `
  --outfile "$env:TEMP\doyonchat-main.json"
```

### デプロイ前のvalidate

機密値はコマンド履歴やログへ残らない方法で渡してください。

```bash
export OPENCODE_GO_API_KEY="sk-..."
export COSMOSDB_KEY="..."
export AUTH_ENABLED="true"
export ENTRA_TENANT_ID="<tenant-id>"
export ENTRA_API_CLIENT_ID="<api-client-id>"

az deployment group validate \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters infra/parameters/staging.parameters.json \
  openCodeGoApiKey="$OPENCODE_GO_API_KEY" \
  cosmosDbKey="$COSMOSDB_KEY" \
  authEnabled="$AUTH_ENABLED" \
  entraTenantId="$ENTRA_TENANT_ID" \
  entraApiClientId="$ENTRA_API_CLIENT_ID"
```

確認するリソース:

- Flex Consumption Plan（FC1）
- Function App
- Functions Storage Account
- `function-deploy` Blob Container
- Cosmos DBへの既存参照
- CORSのSWA URL
- Application Insights接続

---

## 8. GitHub Actions設定

### 8.1 GitHub Environments

以下のEnvironmentを作成します。

- `dev`
- `staging`
- `prod`
- `prod-cleanup`

`prod` と `prod-cleanup` にはRequired reviewersを設定してください。特に `prod-cleanup` は旧App Service削除の承認に使用します。

### 8.2 Environment Secrets

| Secret | 用途 |
|--------|------|
| `AZURE_CREDENTIALS` | `azure/login@v2`用のService Principal JSON |
| `AZURE_RESOURCE_GROUP` | 環境ごとのリソースグループ |
| `OPENCODE_GO_API_KEY` | OpenCode Go APIキー |
| `COSMOSDB_KEY` | Cosmos DBキー |
| `SWA_DEPLOYMENT_TOKEN` | Static Web Appsデプロイトークン |

`AZURE_CREDENTIALS` の例:

```json
{
  "clientId": "<deployment-app-client-id>",
  "clientSecret": "<client-secret>",
  "subscriptionId": "<subscription-id>",
  "tenantId": "<tenant-id>"
}
```

### 8.3 Environment Variables

| Variable | 用途 |
|----------|------|
| `AUTH_ENABLED` | `true` / `false` |
| `ENTRA_TENANT_ID` | JWT issuer検証用テナントID |
| `ENTRA_API_CLIENT_ID` | JWT audience検証用APIアプリID |
| `ENTRA_CLIENT_ID` | フロントエンドSPAアプリID |

`AUTH_ENABLED=true` の場合、`ENTRA_TENANT_ID` と `ENTRA_API_CLIENT_ID` が未設定だとデプロイを停止します。

### 8.4 CI

Functionsまたはworkflowを変更したPull Requestでは、以下が実行されます。

- Functions `npm ci`
- Functions build
- Functions Jest tests
- Bicep構文検証

### 8.5 通常デプロイ

mainブランチへのpush:

```text
devへ自動デプロイ
```

Actionsからの手動実行:

```text
staging または prod を選択
```

デプロイ順序:

1. backend / Functionsテスト
2. インフラデプロイ
3. Functionsビルド・Flex One Deploy
4. 旧Expressバックエンドの並行デプロイ
5. フロントエンドをFunctions URLでビルド
6. Static Web Appsデプロイ

### 8.6 Functionsデプロイ成果物

Functionsのデプロイパッケージには以下を含めます。

```text
host.json
package.json
package-lock.json
dist/
node_modules/（production dependencies）
```

`local.settings.json`、テスト、coverage、ソースマップは含めません。

---

## 9. staging並行検証

本番切替前にstagingで以下を確認します。

### Entra ID

- staging用テナント・APIアプリ登録
- SPA redirect URI
- API audience
- テストユーザーA/Bを2名以上

### API

- health
- models
- 会話作成・一覧・詳細
- メッセージ一覧
- モデル変更
- 削除
- 認証なし・無効トークンの401
- 他ユーザーの会話への404

### ユーザー分離

1. ユーザーAで会話を作成
2. ユーザーBで会話一覧を取得
3. ユーザーAの会話が表示されないことを確認
4. ユーザーBが会話IDを直接指定
5. 詳細・メッセージ・チャット・モデル変更・削除が404になることを確認

### データ保持

- 既存Cosmos DBアカウントを参照している
- `conversations` のパーティションキーが `/id`
- `messages` のパーティションキーが `/conversationId`
- 旧`userId`なしデータが削除されていない
- 認証有効時に旧匿名データが一般ユーザーへ表示されない

### SSE

- 最初のchunkを受信できる
- TTFTを記録できる
- `done:false`イベントが複数届く
- `done:true`が1回届く
- assistantメッセージが保存される
- 総応答時間が約230秒以内

---

## 10. 本番切替

### 切替前

- stagingのExit Criteriaをすべて満たす
- 本番Functionsをデプロイ
- 本番Functionsのhealth、認証、ユーザー分離、SSEを確認
- Cosmos DBの既存データを確認
- App Serviceをロールバック用に保持

### 切替

1. `deploy.yml` をprodで手動実行
2. Functionsのデプロイ成功を確認
3. `VITE_API_URL` がFunctions URLになっていることを確認
4. SWAをデプロイ
5. 本番SWAから主要APIを実行
6. FunctionsログとApplication Insightsを確認
7. App Serviceへの新規アクセスがないことを確認

### ロールバック

App Service削除前であれば:

1. フロントエンドの `VITE_API_URL` を旧App Service URLへ戻す
2. SWAを再ビルド・再デプロイ
3. App Serviceのhealthと主要APIを確認
4. Functionsの原因を調査

---

## 11. 旧App Service削除

旧リソース削除は通常のpushデプロイに含めません。必ず手動承認付きで実行します。

### 事前確認

- 本番SWAがFunctions URLを利用している
- Functionsの主要APIが正常
- FunctionsのSSEが正常
- App Serviceへの新規アクセスがない
- App Service Planを利用する他のWeb Appがない
- what-ifと対象リソース情報を保存済み
- `prod-cleanup` Environmentの承認者が確認済み

### 実行

GitHub ActionsのDeploy workflowを以下で実行します。

```text
Environment: prod
delete-legacy-appservice: true
```

このジョブは `prod-cleanup` Environmentの承認後に以下を実行します。

```bash
az webapp delete \
  --resource-group <resource-group> \
  --name <legacy-api-app-name>

az appservice plan delete \
  --resource-group <resource-group> \
  --name <legacy-app-service-plan-name> \
  --yes
```

### 削除後

- `az webapp show` が404になることを確認
- `az appservice plan show` が404になることを確認
- Functions、Cosmos DB、SWAが稼働していることを確認
- Bicepから旧App Serviceモジュール・出力を削除する後続変更を作成
- workflow、README、環境設定に旧App Service URLが残っていないことを確認

App Service削除後は旧ホストへ即時ロールバックできません。削除前に必ずFunctionsの安定稼働を確認してください。

---

## 12. トラブルシューティング

### `func: command not found`

Azure Functions Core Tools v4をインストールし、PATHを確認します。

```bash
func --version
```

### Functionsが検出されない

以下を確認します。

- `npm run build`を実行したか
- `package.json` の `main` が `dist/index.js` か
- `host.json` がFunctionsプロジェクト直下にあるか
- `src/index.ts` が各Functionファイルをimportしているか

### `GET /api/health` が404

- `func start` を `functions/` ディレクトリで実行しているか
- `host.json` の `routePrefix` が `api` か
- `health.ts` のrouteが `health` か
- 実際のURLが `http://localhost:7071/api/health` か

### 401 Unauthorized

- `AUTH_ENABLED` が意図した値か
- `Authorization: Bearer <token>` が送信されているか
- `ENTRA_TENANT_ID` が正しいか
- `ENTRA_API_CLIENT_ID` がトークンのaudienceと一致しているか
- v2 issuerが `https://login.microsoftonline.com/<tenant-id>/v2.0` になっているか

### 404で会話が取得できない

以下の可能性があります。

- 別ユーザーの会話IDを指定している
- 旧`userId`なしデータを認証有効モードで指定している
- Cosmos DBの対象環境が異なる
- `userId`の値がJWTの`oid`と一致していない

### 503 Database unavailable

`COSMOSDB_REQUIRED=true` でCosmos DBへ接続できない場合に発生します。

- `COSMOSDB_ENDPOINT`を確認
- `COSMOSDB_KEY`を確認
- `COSMOSDB_DATABASE`を確認
- Storage / Cosmos DBのネットワーク制限を確認
- staging・本番ではin-memory fallbackを有効にしない

### CORSエラー

- `FRONTEND_URL`がSWAの実際のoriginと一致しているか
- BicepのFunction App CORS設定を確認
- `Authorization`ヘッダーがプリフライトで許可されているか

### Flexデプロイ時に `FUNCTIONS_WORKER_RUNTIME` がinvalidになる

Flex Consumptionでは、ランタイムを`functionAppConfig.runtime`で指定します。Azure側に残った旧アプリ設定を一度削除してから再デプロイします。

```bash
az functionapp config appsettings delete \
  --resource-group <resource-group> \
  --name <function-app-name> \
  --setting-names FUNCTIONS_WORKER_RUNTIME FUNCTIONS_EXTENSION_VERSION
```

`functions/local.settings.json` の同名設定はCore Tools用なので削除しません。Flex用BicepではこれらをAzureアプリ設定に登録しません。

### Flexデプロイ後にFunctionが表示されない

- `Azure/functions-action@v1`でデプロイしているか
- Flex ConsumptionのOne Deployとして実行されているか
- デプロイ用Blob Container設定が存在するか
- `host.json`がパッケージルートにあるか
- `package.json` の `main` がコンパイル済みエントリポイントを指しているか

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `specs/006-user-isolation-functions/spec.md` | 統合仕様 |
| `specs/006-user-isolation-functions/plan.md` | 実装計画 |
| `functions/local.settings.json.example` | Functionsローカル設定テンプレート |
| `infra/modules/functions.bicep` | Flex Consumptionリソース定義 |
| `infra/main.bicep` | 全体インフラ定義 |
| `.github/workflows/ci.yml` | PR時のFunctions・backend・Bicep検証 |
| `.github/workflows/deploy.yml` | Functions・SWAデプロイとlegacy cleanup |
| `frontend/.env.example` | Functions API URLを含むフロントエンド設定 |
