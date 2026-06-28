# クイックスタート：OpenCode Go チャット Web アプリ

## 前提条件

- Node.js 20+（LTS）
- Azure CosmosDB Emulator（ローカル）または Azure CosmosDB アカウント（クラウド）
- OpenCode Go API キー（[https://opencode.ai/docs/go/](https://opencode.ai/docs/go/)）
- Azure CLI（デプロイ用、オプション）

## ローカル環境の設定

### 1. リポジトリのクローンと依存関係のインストール

```bash
# バックエンド
cd backend
npm install

# フロントエンド
cd ../frontend
npm install
```

### 2. CosmosDB のセットアップ

**オプションA: Azure CosmosDB Emulator（ローカル）**
```bash
# Microsoft からダウンロードしてインストール
# https://docs.microsoft.com/ja-jp/azure/cosmos-db/local-emulator

# Emulator を起動（デフォルトエンドポイント）
# https://localhost:8081/
# キー: C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
```

**オプションB: Azure CosmosDB（クラウド）**
```bash
# Azure Portal または CLI で作成
az cosmosdb create --name <アカウント名> --resource-group <リソースグループ> --locations regionName=japaneast
```

**コンテナの初期化**
```bash
cd backend
npm run db:init
```

### 3. 環境変数の設定

```bash
# バックエンド
cp backend/.env.example backend/.env

# backend/.env を編集
COSMOSDB_ENDPOINT=https://localhost:8081/
COSMOSDB_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
COSMOSDB_DATABASE=chatdb
OPENCODE_GO_API_KEY=sk-opencode-your-key-here
OPENCODE_GO_MODEL=kimi-k2.6
PORT=3000
FRONTEND_URL=http://localhost:5173
```

```bash
# フロントエンド
cp frontend/.env.example frontend/.env

# frontend/.env を編集
VITE_API_URL=http://localhost:3000/api
```

### 4. 開発サーバーの起動

```bash
# ターミナル1 - バックエンド
cd backend
npm run dev

# ターミナル2 - フロントエンド
cd frontend
npm run dev
```

- フロントエンド: http://localhost:5173
- バックエンド: http://localhost:3000

### 5. テストの実行

```bash
# バックエンドテスト
cd backend
npm test

# フロントエンドテスト
cd frontend
npm test

# E2Eテスト
cd frontend
npx playwright test
```

## Azure へのデプロイ

### 前提条件

- Azure CLI へのログイン済み（`az login`）
- Azure サブスクリプション
- 以下のパラメータファイルのプレースホルダーを実際の値に置き換えていること

### 事前準備

#### 1. パラメータファイルのプレースホルダー置き換え

`infra/parameters/*.parameters.json` の以下のプレースホルダーを、実際の Azure テナント・オブジェクト ID に置き換えてください。

| プレースホルダー | 取得方法 |
|----------------|---------|
| `TENANT_ID` | `az account show --query tenantId -o tsv` |
| `OBJECT_ID` | `az ad signed-in-user show --query id -o tsv` |

```bash
# 例: dev.parameters.json の更新
TENANT_ID=$(az account show --query tenantId -o tsv)
OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
sed -i "s/TENANT_ID/${TENANT_ID}/g" infra/parameters/dev.parameters.json
sed -i "s/OBJECT_ID/${OBJECT_ID}/g" infra/parameters/dev.parameters.json
```

#### 2. Static Web Apps デプロイトークンの取得（GitHub Actions でのデプロイ時のみ必要）

```bash
# ステージング環境
az staticwebapp secrets list \
  --name swa-staging \
  --resource-group rg-opencode-chat-staging \
  --query properties.apiKey -o tsv

# 本番環境（デプロイ後に取得）
az staticwebapp secrets list \
  --name swa-prod \
  --resource-group rg-opencode-chat-prod \
  --query properties.apiKey -o tsv
```

取得したトークンを GitHub Actions Secrets に登録します。

#### 3. GitHub Actions Secrets / Variables の設定

**Secrets（機密情報）:**

| シークレット名 | 値 | 説明 |
|--------------|-----|------|
| `AZURE_CREDENTIALS` | `az ad sp create-for-rbac` で取得した JSON | Azure ログイン用サービスプリンシパル |
| `OPENCODE_GO_API_KEY` | OpenCode Go API キー | AI モデル呼び出し用 |
| `COSMOSDB_KEY` | CosmosDB プライマリキー | データベース接続用 |
| `SWA_DEPLOYMENT_TOKEN` | ステージング SWA のデプロイトークン | フロントエンドデプロイ用 |
| `SWA_PRODUCTION_TOKEN` | 本番 SWA のデプロイトークン | 本番フロントエンドデプロイ用 |

**Variables（非機密情報）:**

| 変数名 | 値の例 | 説明 |
|-------|--------|------|
| `VITE_API_URL` | `https://api-staging.azurewebsites.net/api` | フロントエンドからの API 呼び出し先 |

> **注意:** `VITE_API_URL` は各環境ごとに設定してください。ステージング環境の URL はインフラデプロイ後に確定するため、初回デプロイ後に `Settings > Environments > staging > Environment variables` で設定してください。

### Bicep でのデプロイ（手動）

#### バリデーション

バリデーションを実行する前に、**必須の環境変数**を設定してください。`COSMOSDB_KEY` は初回デプロイ時は不要です（Bicep が CosmosDB 作成後に自動取得します）。

**Bash:**
```bash
# 1. 必須の環境変数を設定
export OPENCODE_GO_API_KEY="sk-your-key-here"

# 2. （オプション）既存の CosmosDB キーを使用する場合のみ設定
# export COSMOSDB_KEY="your-cosmosdb-key"

# 3. Bicep テンプレートの構文チェック
az bicep build --file infra/main.bicep

# 4. What-If 実行（変更予定の確認）
./infra/scripts/validate.sh dev
```

**PowerShell:**
```powershell
# 1. 必須の環境変数を設定
$env:OPENCODE_GO_API_KEY = "sk-your-key-here"

# 2. （オプション）既存の CosmosDB キーを使用する場合のみ設定
# $env:COSMOSDB_KEY = "your-cosmosdb-key"

# 3. Bicep テンプレートの構文チェック
az bicep build --file infra/main.bicep

# 4. What-If 実行（変更予定の確認）
.\infra\scripts\validate.ps1 dev
```

#### 開発環境のデプロイ

**Bash:**
```bash
# 環境変数を設定（COSMOSDB_KEY は初回は不要）
export OPENCODE_GO_API_KEY="sk-your-key-here"
./infra/scripts/deploy.sh dev
```

**PowerShell:**
```powershell
# 環境変数を設定（COSMOSDB_KEY は初回は不要）
$env:OPENCODE_GO_API_KEY = "sk-your-key-here"
.\infra\scripts\deploy.ps1 dev
```

> **補足:** 2回目以降のデプロイで CosmosDB キーを明示的に指定したい場合は、以下のように設定してください：
> ```bash
> export OPENCODE_GO_API_KEY="sk-your-key-here"
> export COSMOSDB_KEY="$(az cosmosdb keys list --name cosmos-dev --resource-group rg-opencode-chat-dev --query primaryMasterKey -o tsv)"
> ./infra/scripts/deploy.sh dev
> ```

#### ステージング / 本番環境のデプロイ

**Bash:**
```bash
# ステージング
export OPENCODE_GO_API_KEY="sk-your-key-here"
./infra/scripts/deploy.sh staging

# 本番
export OPENCODE_GO_API_KEY="sk-your-key-here"
./infra/scripts/deploy.sh prod
```

**PowerShell:**
```powershell
# ステージング
$env:OPENCODE_GO_API_KEY = "sk-your-key-here"
.\infra\scripts\deploy.ps1 staging

# 本番
$env:OPENCODE_GO_API_KEY = "sk-your-key-here"
.\infra\scripts\deploy.ps1 prod
```

### GitHub Actions でのデプロイ

`main` ブランチへのプッシュで CI/CD パイプラインがトリガーされます：

1. **CI**（PR時）：リント → ユニットテスト → 統合テスト → IaC バリデーション
2. **デプロイ**（main マージ時）：テスト → ステージングへインフラデプロイ → アプリデプロイ → スモークテスト → 手動承認 → 本番へデプロイ

#### 手動トリガー

GitHub Actions の「Run workflow」から以下のいずれかを選択して実行できます：
- `staging`（デフォルト）
- `prod`（本番環境）

### アプリケーションの手動デプロイ

Bicep でインフラをデプロイした後、バックエンドとフロントエンドのアプリケーションコードを個別にデプロイします。

> **補足:** GitHub Actions でのデプロイを使用する場合は、この手順は不要です。

#### 前提条件

インフラデプロイ後、以下の値を確認してください。

```bash
# App Service の名前を確認
az webapp list --resource-group rg-opencode-chat-dev --query [].name -o tsv

# Static Web Apps の名前を確認
az staticwebapp list --resource-group rg-opencode-chat-dev --query [].name -o tsv

# App Service の URL を確認
az webapp list --resource-group rg-opencode-chat-dev --query [].defaultHostName -o tsv
```

#### バックエンドのビルドとデプロイ

**1. ビルド（ローカルで実行）**

```bash
cd backend
npm ci
npm run build
# → dist/server-bundle.js が生成される
```

> **補足:** `backend/package.json` の `build` スクリプトは `--packages=external` を使用しています。これにより `express` などの `node_modules` 内のモジュールはバンドルに含めず、実行時に `require()` で読み込みます。そのため、本番環境には **`dist/` と `node_modules/` の両方が必要** です。

**2. デプロイ（ZIP方式 ※推奨）**

ビルド済みの成果物を ZIP でアップロードする方式です。`src/` は含めません。

> **⚠️ 重要:** PowerShell の `Compress-Archive` は Windows 形式の `\` をパス区切りに使うため、Linux App Service で rsync エラーが発生します。以下の **Python スクリプト** を使用して ZIP を作成してください。

**Bash:**
```bash
cd backend
# Python で Linux 互換の ZIP を作成（/ 区切り）
python3 -c "
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files:
            fp = os.path.join(root, f)
            zf.write(fp, fp.replace('\\\\', '/'))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.isfile(fp):
                zf.write(fp, fp.replace('\\\\', '/'))
    zf.write('package.json', 'package.json')
print('Created: deploy.zip')
"

az webapp deploy \
  --resource-group rg-opencode-chat-dev \
  --name <api-app-name> \
  --src-path deploy.zip \
  --type zip
```

**PowerShell:**
```powershell
cd backend
# Python で Linux 互換の ZIP を作成（/ 区切り）
python -c "
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files:
            fp = os.path.join(root, f)
            zf.write(fp, fp.replace(chr(92), '/'))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.isfile(fp):
                zf.write(fp, fp.replace(chr(92), '/'))
    zf.write('package.json', 'package.json')
print('Created: deploy.zip')
"

az webapp deploy `
  --resource-group rg-opencode-chat-dev `
  --name <api-app-name> `
  --src-path deploy.zip `
  --type zip
```

**3. デプロイ確認**

```bash
az webapp log tail --resource-group rg-opencode-chat-dev --name <api-app-name>
# またはブラウザで確認
curl https://<api-app-name>.azurewebsites.net/api/health
```

#### フロントエンドのビルドとデプロイ

**1. 環境変数の設定**

ビルド前に、デプロイ先のバックエンド URL を設定します。

```bash
# バックエンドの URL を確認
API_URL=$(az webapp list --resource-group rg-opencode-chat-dev --query [].defaultHostName -o tsv)
echo "Backend URL: https://${API_URL}/api"
```

**2. ビルド**

```bash
cd frontend
npm ci
VITE_API_URL="https://${API_URL}/api" npm run build
# → dist/ ディレクトリに成果物が出力される
```

> **PowerShell の場合:**
> ```powershell
> cd frontend
> $env:VITE_API_URL = "https://$API_URL/api"
> npm ci
> npm run build
> ```

**3. デプロイ（SWA CLI）**

```bash
cd frontend

# Static Web Apps CLI でデプロイ
npx @azure/static-web-apps-cli deploy ./dist \
  --env production \
  --deployment-token <swa-deployment-token>
```

> **デプロイトークンの取得:**
> ```bash
> az staticwebapp secrets list \
>   --name <swa-name> \
>   --resource-group rg-opencode-chat-dev \
>   --query properties.apiKey -o tsv
> ```

**4. デプロイ確認**

ブラウザで Static Web Apps の URL を開き、チャット画面が表示されることを確認します。

```bash
# Static Web Apps の URL を確認
az staticwebapp list --resource-group rg-opencode-chat-dev --query [].defaultHostname -o tsv
```

#### 環境ごとのデプロイ例

**開発環境（dev）:**

**Bash:**
```bash
# 1. インフラデプロイ
export OPENCODE_GO_API_KEY="sk-your-key-here"
./infra/scripts/deploy.sh dev

# 2. バックエンドデプロイ
cd backend && npm ci && npm run build
python3 -c "
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files: zf.write(os.path.join(root, f), os.path.join(root, f).replace('\\\\', '/'))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.isfile(fp): zf.write(fp, fp.replace('\\\\', '/'))
    zf.write('package.json', 'package.json')
print('Created: deploy.zip')
"
az webapp deploy --resource-group rg-opencode-chat-dev --name <api-app-name> --src-path deploy.zip --type zip

# 3. フロントエンドデプロイ
API_URL=$(az webapp list --resource-group rg-opencode-chat-dev --query [].defaultHostName -o tsv)
cd ../frontend && npm ci
VITE_API_URL="https://${API_URL}/api" npm run build
SWA_TOKEN=$(az staticwebapp secrets list --name <swa-name> --resource-group rg-opencode-chat-dev --query properties.apiKey -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --env production --deployment-token "$SWA_TOKEN"
```

**PowerShell:**
```powershell
# 1. インフラデプロイ
$env:OPENCODE_GO_API_KEY = "sk-your-key-here"
.\infra\scripts\deploy.ps1 dev

# 2. バックエンドデプロイ
cd backend; npm ci; npm run build
python -c "
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files: zf.write(os.path.join(root, f), os.path.join(root, f).replace(chr(92), '/'))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.isfile(fp): zf.write(fp, fp.replace(chr(92), '/'))
    zf.write('package.json', 'package.json')
print('Created: deploy.zip')
"
az webapp deploy --resource-group rg-opencode-chat-dev --name <api-app-name> --src-path deploy.zip --type zip

# 3. フロントエンドデプロイ
$API_URL = az webapp list --resource-group rg-opencode-chat-dev --query [].defaultHostName -o tsv
cd ..\frontend; npm ci
$env:VITE_API_URL = "https://$API_URL/api"
npm run build
$SWA_TOKEN = az staticwebapp secrets list --name <swa-name> --resource-group rg-opencode-chat-dev --query properties.apiKey -o tsv
npx @azure/static-web-apps-cli deploy ./dist --env production --deployment-token "$SWA_TOKEN"
```

**ステージング環境（staging）:**

**Bash:**
```bash
export OPENCODE_GO_API_KEY="sk-your-key-here"
./infra/scripts/deploy.sh staging

# バックエンド
cd backend && npm ci && npm run build
python3 -c "
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files: zf.write(os.path.join(root, f), os.path.join(root, f).replace('\\\\', '/'))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.isfile(fp): zf.write(fp, fp.replace('\\\\', '/'))
    zf.write('package.json', 'package.json')
print('Created: deploy.zip')
"
az webapp deploy --resource-group rg-opencode-chat-staging --name <api-app-name> --src-path deploy.zip --type zip

# フロントエンド
API_URL=$(az webapp list --resource-group rg-opencode-chat-staging --query [].defaultHostName -o tsv)
cd ../frontend && npm ci
VITE_API_URL="https://${API_URL}/api" npm run build
SWA_TOKEN=$(az staticwebapp secrets list --name <swa-name> --resource-group rg-opencode-chat-staging --query properties.apiKey -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --env production --deployment-token "$SWA_TOKEN"
```

**PowerShell:**
```powershell
$env:OPENCODE_GO_API_KEY = "sk-your-key-here"
.\infra\scripts\deploy.ps1 staging

# バックエンド
cd backend; npm ci; npm run build
python -c "
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files: zf.write(os.path.join(root, f), os.path.join(root, f).replace(chr(92), '/'))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            fp = os.path.join(root, f)
            if os.path.isfile(fp): zf.write(fp, fp.replace(chr(92), '/'))
    zf.write('package.json', 'package.json')
print('Created: deploy.zip')
"
az webapp deploy --resource-group rg-opencode-chat-staging --name <api-app-name> --src-path deploy.zip --type zip

# フロントエンド
$API_URL = az webapp list --resource-group rg-opencode-chat-staging --query [].defaultHostName -o tsv
cd ..\frontend; npm ci
$env:VITE_API_URL = "https://$API_URL/api"
npm run build
$SWA_TOKEN = az staticwebapp secrets list --name <swa-name> --resource-group rg-opencode-chat-staging --query properties.apiKey -o tsv
npx @azure/static-web-apps-cli deploy ./dist --env production --deployment-token "$SWA_TOKEN"
```

### デプロイ後の確認

```bash
# API のヘルスチェック
curl https://<api-app-name>.azurewebsites.net/api/health

# モデル一覧の確認
curl https://<api-app-name>.azurewebsites.net/api/models

# フロントエンドの確認
# ブラウザで https://<swa-name>.azurestaticapps.net を開く
```

### テストの実行

```bash
# ユニットテスト（バックエンド）
cd backend
npm run test:unit

# ユニットテスト（フロントエンド）
cd frontend
npm run test:unit

# 統合テスト（CosmosDB Emulator または実アカウントが必要）
cd backend
npm run test:integration

# E2Eテスト（開発サーバー起動が必要）
cd frontend
npm run test:e2e

# E2Eテスト（デバッグ用ヘッドレスモード）
cd frontend
npm run test:e2e:ui

# 全テスト実行
cd backend && npm test
cd frontend && npm test
```

### テストカバレッジ

```bash
# カバレッジレポートの生成
cd backend
npm run test:coverage

cd frontend
npm run test:coverage
```

### トラブルシューティング

#### バックエンドデプロイ時の rsync エラー（`Invalid argument (22)`）

**症状:**
```
rsync: recv_generator: failed to stat "/home/site/wwwroot/dist\server-bundle.js": Invalid argument (22)
```

**原因:** PowerShell の `Compress-Archive` や `zip` コマンドが Windows 形式の `\` をパス区切りに使用した ZIP を作成したため、Linux App Service で rsync が失敗します。

**解決策:**
Python の `zipfile` を使用して `/` 区切りの ZIP を作成してください（上記「バックエンドのビルドとデプロイ」セクションの Python スクリプトを参照）。

#### バックエンドデプロイ時の 504/502 Gateway Timeout

**症状:**
```
Status Code: 504, Details: 504.0 GatewayTimeout
```

**原因:** App Service Plan のリソース（CPU/メモリ）が不足し、Oryx の `npm install` や ZIP 展開がタイムアウトしています。B1 (Basic) プランでは特に発生しやすいです。

**解決策:**
App Service Plan を P1v2 (PremiumV2) 以上にアップグレードしてください。

```bash
az appservice plan update --name <plan-name> --resource-group rg-opencode-chat-dev --sku P1v2
```

> **補足:** `infra/parameters/dev.parameters.json` は既に P1v2 に設定されています。Bicep で新規デプロイする場合はこの問題は発生しません。

#### `Cannot find module 'express'`（アプリケーションエラー）

**症状:**
```
Error: Cannot find module 'express'
Require stack: /home/site/wwwroot/dist/server-bundle.js
```

**原因:** `esbuild --packages=external` を使用してビルドした場合、`express` などのモジュールはバンドルに含まれず、実行時に `node_modules` から読み込まれます。`node_modules` がデプロイされていないか、破損しているとこのエラーが発生します。

**解決策:**
ZIP に `dist/` と `node_modules/` の両方を含めて再デプロイしてください。

#### 静的 Web Apps のデプロイで `Object reference not set to an instance of an object`

**症状:**
```
InternalServerError: Object reference not set to an instance of an object.
```

**原因:** `infra/modules/staticWebApp.bicep` の `kind: 'string'` が無効な値でした。

**解決策:**
`kind` プロパティを削除しました（現在の Bicep テンプレートは修正済みです）。

#### CosmosDB の DNS 名重複エラー

**症状:**
```
Dns record for cosmos-dev under zone Document is already taken.
```

**原因:** CosmosDB アカウント名はグローバルで一意である必要があります。

**解決策:**
`infra/main.bicep` で `uniqueString(resourceGroup().id)` を付加して一意性を確保しています（現在のテンプレートは修正済みです）。

#### CORS エラー（`No 'Access-Control-Allow-Origin' header`）

**症状:**
```
Access to fetch at 'https://api-xxx.azurewebsites.net/api/...' from origin 'https://xxx.azurestaticapps.net' has been blocked by CORS policy.
```

**原因:** Azure Portal 側の CORS 設定と、Express アプリケーション側の `cors` ミドルウェアが競合しています。両方で CORS を設定すると、Azure Portal 側が優先されてアプリケーション側の設定が無視されることがあります。

**解決策:**

1. **Azure Portal 側の CORS を削除**（推奨）

```bash
# 現在の CORS 設定を確認
az webapp cors show --resource-group rg-opencode-chat-dev --name <api-app-name>

# すべての CORS 設定を削除
az webapp cors remove --resource-group rg-opencode-chat-dev --name <api-app-name> --allowed-origins "http://localhost:5173"
az webapp cors remove --resource-group rg-opencode-chat-dev --name <api-app-name> --allowed-origins "https://<swa-name>.azurestaticapps.net"
```

2. **Express アプリケーション側で `FRONTEND_URL` 環境変数を設定**

App Service のアプリケーション設定で `FRONTEND_URL` をフロントエンドの URL に設定してください：

```bash
az webapp config appsettings set \
  --resource-group rg-opencode-chat-dev \
  --name <api-app-name> \
  --settings FRONTEND_URL="https://<swa-name>.azurestaticapps.net"
```

> **補足:** `backend/src/app.ts` の `cors` ミドルウェアは `FRONTEND_URL` 環境変数を参照して CORS を制御します。Azure Portal 側の CORS は空にして、アプリケーション側に一元管理させるのが推奨です。

## 環境変数リファレンス

### バックエンド

| 変数 | 必須 | 説明 |
|----------|----------|----------|
| `PORT` | はい | サーバーポート（デフォルト: 3000） |
| `COSMOSDB_ENDPOINT` | はい | CosmosDB エンドポイントURL |
| `COSMOSDB_KEY` | はい | CosmosDB プライマリキー |
| `COSMOSDB_DATABASE` | はい | CosmosDB データベース名 |
| `OPENCODE_GO_API_KEY` | はい | OpenCode Go API キー |
| `OPENCODE_GO_MODEL` | いいえ | デフォルトモデル（デフォルト: kimi-k2.6） |
| `MODEL_LIST` | いいえ | 有効なモデルのカンマ区切りリスト |
| `FRONTEND_URL` | はい | CORS許可元のOrigin |

### フロントエンド

| 変数 | 必須 | 説明 |
|----------|----------|----------|
| `VITE_API_URL` | はい | バックエンドAPIのベースURL |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | いいえ | Application Insights 接続文字列 |

### CI/CD（GitHub Actions Secrets）

| シークレット | 必須 | 説明 |
|----------|----------|----------|
| `AZURE_CREDENTIALS` | はい | Azure ログイン用のサービスプリンシパルJSON |
| `OPENCODE_GO_API_KEY` | はい | OpenCode Go API キー |
| `COSMOSDB_KEY` | はい | CosmosDB プライマリキー（開発/ステージング用） |
| `SWA_DEPLOYMENT_TOKEN` | はい | ステージング Static Web Apps デプロイトークン |
| `SWA_PRODUCTION_TOKEN` | いいえ | 本番 Static Web Apps デプロイトークン |
| `APPINSIGHTS_INSTRUMENTATION_KEY` | いいえ | Application Insights キー |

### CI/CD（GitHub Actions Variables）

| 変数 | 必須 | 説明 |
|------|------|------|
| `VITE_API_URL` | はい | フロントエンドのビルド時に使用する API URL（環境ごとに設定） |
