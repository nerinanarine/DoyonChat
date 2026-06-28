# Phase 3: Azure 認証設定 セットアップガイド

## 概要

このガイドでは、GitHub Actions から Azure へ安全に認証するためのセットアップ手順を説明します。

**認証方式**: Service Principal + OpenID Connect (OIDC) Federated Credentials  
**対応ワークフロー**: `ci.yml` (PR 時のインフラ検証), `deploy.yml` (本番デプロイ)

---

## 前提条件

| ツール | バージョン | 確認コマンド | インストール |
|--------|-----------|-------------|-------------|
| Azure CLI | 2.50+ | `az --version` | [インストール](https://docs.microsoft.com/cli/azure/install-azure-cli) |
| GitHub CLI | 2.30+ | `gh --version` | [インストール](https://cli.github.com/) |
| jq | 1.6+ | `jq --version` | `apt-get install jq` / `brew install jq` |

### 必要な権限

- **Azure**: サブスクリプションの Owner または User Access Administrator ロール（Service Principal 作成のため）
- **GitHub**: リポジトリの Admin 権限（Secrets / Variables 登録のため）

---

## 手順 1: Azure Service Principal + Federated Credentials の作成

`setup-federated-credentials.sh` を実行して、Service Principal の作成と OIDC 連携設定を一度に行います。

```bash
# 実行前に Azure CLI にログイン
az login

# スクリプトに実行権限を付与
chmod +x infra/scripts/setup-federated-credentials.sh

# 実行
./infra/scripts/setup-federated-credentials.sh \
  --repo "YOUR_ORG/YOUR_REPO" \
  --subscription-id "00000000-0000-0000-0000-000000000000" \
  --resource-group "rg-opencode-chat-prod"
```

### 各引数の説明

| 引数 | 必須 | 説明 | 例 |
|------|------|------|-----|
| `--repo` | ✅ | GitHub リポジトリ（`owner/repo` 形式） | `myorg/opencode-chat` |
| `--subscription-id` | ✅ | Azure サブスクリプション ID | `00000000-0000-0000-0000-000000000000` |
| `--resource-group` | ✅ | デプロイ先のリソースグループ名 | `rg-opencode-chat-prod` |
| `--name` | | Service Principal の表示名 | `github-actions-opencode-chat` (デフォルト) |
| `--role` | | 割り当てる Azure ロール | `contributor` (デフォルト) |

### 実行内容

スクリプトは以下の 3 ステップを実行します：

1. **Service Principal 作成**: `az ad sp create-for-rbac` で作成し、指定したリソースグループの Contributor ロールを割り当て
2. **Federated Credential (main ブランチ用)**: `repo:OWNER/REPO:ref:refs/heads/main` をサブジェクトとする OIDC 連携を設定
3. **Federated Credential (PR 用)**: `repo:OWNER/REPO:pull_request` をサブジェクトとする OIDC 連携を設定

### 出力

実行成功後、以下の情報が表示されます。**GitHub Secrets 登録に使用するため、安全に保管してください**。

- `AZURE_CREDENTIALS` JSON（Service Principal の認証情報）
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`

---

## 手順 2: GitHub Secrets / Variables の登録

### 方法 A: 自動スクリプトで登録（推奨）

`setup-github-secrets.sh` を使用して、必要な Secrets と Variables を一括登録します。

```bash
chmod +x infra/scripts/setup-github-secrets.sh

# 対話形式（各値の入力を求められます）
./infra/scripts/setup-github-secrets.sh

# または、引数渡し（非対話・自動化用途）
./infra/scripts/setup-github-secrets.sh \
  --repo "YOUR_ORG/YOUR_REPO" \
  --azure-credentials '{"clientId":"...","clientSecret":"...","subscriptionId":"...","tenantId":"..."}' \
  --subscription-id "00000000-0000-0000-0000-000000000000" \
  --resource-group "rg-opencode-chat-prod" \
  --opencode-api-key "sk-..." \
  --cosmosdb-key "..." \
  --location "japaneast" \
  --app-service-name "api-prod" \
  --static-web-app-name "opencode-chat"
```

> **注意**: `--azure-credentials` の値は、手順 1 の出力からコピーしてください。JSON 文字列全体をシングルクォートで囲んで渡します。

### 方法 B: 手動で登録（代替）

GitHub リポジトリの **Settings > Secrets and variables > Actions** から手動登録します。

#### Secrets タブに以下を登録

| 名前 | 値 | 説明 |
|------|-----|------|
| `AZURE_CREDENTIALS` | `setup-federated-credentials.sh` の出力 JSON | Azure SP 認証情報 |
| `AZURE_SUBSCRIPTION_ID` | サブスクリプション ID（UUID） | Azure サブスクリプション |
| `AZURE_RESOURCE_GROUP` | `rg-opencode-chat-prod` | デプロイ先リソースグループ |
| `OPENCODE_GO_API_KEY` | API キー文字列 | OpenCode Go API キー |
| `COSMOSDB_KEY` | アクセスキー文字列 | CosmosDB のプライマリキー |

#### Variables タブに以下を登録

| 名前 | 値 | 説明 |
|------|-----|------|
| `AZURE_LOCATION` | `japaneast` | Azure リージョン |
| `APP_SERVICE_NAME` | App Service 名（例: `api-prod`） | バックエンド App Service |
| `STATIC_WEB_APP_NAME` | Static Web App 名（例: `opencode-chat`） | フロントエンド Static Web App |

---

## 手順 3: 検証

### 3.1 CI ワークフローの手動実行

GitHub リポジトリの **Actions** タブから、`CI` ワークフローを選択し、`Run workflow` ボタンで手動実行します。

```bash
# CLI からも実行可能
gh workflow run ci.yml --repo YOUR_ORG/YOUR_REPO --ref main
```

### 3.2 検証ポイント

| 確認項目 | 期待される結果 |
|----------|---------------|
| Azure Login ステップ | ✅ 成功（OIDC 認証が確立される） |
| Bicep Build ステップ | ✅ 構文検証が成功 |
| Validate Deployment (What-If) | ✅ デプロイ検証が成功（実際のデプロイは行われない） |

### 3.3 トラブルシューティング

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `AADSTS70021: No matching federated identity record` | Federated Credential の subject が一致していない | `--repo` 引数の値が正しいか確認（大文字小文字も区別） |
| `AADSTS700016: Application not found` | App ID が一致していない | `AZURE_CREDENTIALS` の `clientId` が正しいか確認 |
| `AuthorizationFailed` | Service Principal に十分な権限がない | `--role contributor` をつけて再作成するか、リソースグループの IAM で権限を追加 |
| `gh secret set` が失敗 | GitHub CLI の認証が切れている | `gh auth login` を再実行 |

---

## 次のステップ

Phase 3 のセットアップ完了後は、[Phase 4: デプロイワークフロー](../004-deploy-workflow/plan.md) に進みます。

Phase 4 では以下を実装します：
- `.github/workflows/deploy.yml` の本番環境単一フロー化（現在の staging/prod 分離を修正）
- `azure/login@v2` への統一（現在の @v1 を更新）
- main ブランチマージ時の自動デプロイ設定

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `infra/scripts/setup-federated-credentials.sh` | Azure SP + OIDC セットアップスクリプト |
| `infra/scripts/setup-github-secrets.sh` | GitHub Secrets/Variables 登録スクリプト |
| `.github/workflows/ci.yml` | PR 時の CI ワークフロー（`validate-infra` ジョブが Azure 認証を使用） |
| `specs/003-setup-ci-cd-pipeline/plan.md` | 全体実装計画 |
| `specs/003-setup-ci-cd-pipeline/spec.md` | 機能仕様書 |
