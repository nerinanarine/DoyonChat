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

## Phase 7: ブランチ保護ルール設定

main ブランチへの直接プッシュを禁止し、PR マージ前に CI チェックの成功を必須化します。

### 設定手順

1. GitHub リポジトリを開き、**Settings > Branches** に移動
2. **Branch protection rules** の **Add rule** をクリック
3. **Branch name pattern** に `main` を入力
4. 以下の項目を有効化：

| 設定項目 | 状態 | 説明 |
|----------|------|------|
| **Restrict deletions** | ✅ | ブランチの強制削除を禁止 |
| **Require a pull request before merging** | ✅ | PR 必須化 |
| → Require approvals | 0 | 個人プロジェクトのためレビュー承認は不要 |
| → Dismiss stale PR approvals when new commits are pushed | ✅ | 新コミット時に承認を無効化 |
| **Require status checks to pass before merging** | ✅ | CI チェック成功を必須化 |
| → Search for status checks: | `test-backend`, `validate-infra` | ci.yml のジョブ名を入力して追加 |
| → Require branches to be up to date before merging | ✅ | マージ前に最新 main を取り込むことを強制 |
| **Require conversation resolution before merging** | ✅ | 未解決のレビューコメントをブロック |
| **Do not allow bypassing the above settings** | ✅ | Admin 権限でもブランチ保護を迂回不可 |
| **Restrict pushes that create files larger than 100 MB** | ✅ | 大ファイルの誤コミット防止 |

5. **Create** をクリックして保存

### 検証

設定後、以下を確認します：

```bash
# main ブランチに直接プッシュしようとする（拒否されるはず）
git checkout main
git pull
echo "test" >> README.md
git add README.md
git commit -m "test direct push"
git push origin main
# → ! [remote rejected] main -> main (protected branch hook declined)
```

拒否されたら成功です。必ず Feature ブランチを切って PR を経由する必要があります。

---

## 次のステップ

ブランチ保護ルールの設定完了後、以下のフローで運用します：

1. Feature ブランチを切る: `bash .specify/extensions/git/scripts/bash/create-new-feature.sh "feature name"`
2. コード変更 → コミット → PR 作成
3. CI チェック（`test-backend` / `validate-infra`）が自動実行
4. チェック成功後、PR をマージ
5. main マージにより `deploy.yml` が自動実行 → 本番デプロイ

全フェーズ完了後は [Phase 8: 最終検証・ドキュメント更新](./plan.md) を参照してください。

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `infra/scripts/setup-federated-credentials.sh` | Azure SP + OIDC セットアップスクリプト |
| `infra/scripts/setup-github-secrets.sh` | GitHub Secrets/Variables 登録スクリプト |
| `.github/workflows/ci.yml` | PR 時の CI ワークフロー（`validate-infra` ジョブが Azure 認証を使用） |
| `specs/003-setup-ci-cd-pipeline/plan.md` | 全体実装計画 |
| `specs/003-setup-ci-cd-pipeline/spec.md` | 機能仕様書 |
