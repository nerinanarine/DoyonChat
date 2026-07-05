# Implementation Plan: CI/CD Pipeline Setup

**Branch**: `[003-setup-ci-cd-pipeline]` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-setup-ci-cd-pipeline/spec.md`

## Summary

GitHub Actionsを使用したCI/CDパイプラインの構築。個人プロジェクトのため、本番環境のみを対象とし、ステージング環境は持たない。PR作成時に自動テスト・インフラ検証を実行し、mainブランチへのマージ時に本番環境へ自動デプロイする。

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.4

**Primary Dependencies**:
- **Backend**: Express 4, Jest（テスト）
- **Infrastructure**: Azure Bicep, ARM Templates
- **CI/CD**: GitHub Actions (ubuntu-latest)

**Testing**: Jest（バックエンドユニットテスト）

**Target Platform**: Azure (App Service + Static Web Apps)

**Project Type**: CI/CD infrastructure (no application code changes)

**Performance Goals**:
- CI実行時間（キャッシュヒット時）: 3分以内
- CI実行時間（キャッシュなし）: 5分以内

**Constraints**:
- 個人プロジェクトのため、ステージング環境は持たない
- Azure認証情報はGitHub Secretsで管理
- デプロイ対象は本番環境のみ
- `npm test` は既存のJest設定で実行可能

**Scale/Scope**: 個人開発用。単一リポジトリ、単一本番環境。

## Constitution Check

- [x] CIとCDのワークフローは分離して定義し、責務を明確にする
- [x] 各フェーズは独立して検証可能
- [x] パスフィルタで不要なジョブ実行をスキップする
- [x] 個人プロジェクトのため、過剰な監視/通知基盤は構築しない

## Project Structure

### Documentation (this feature)

```text
specs/003-setup-ci-cd-pipeline/
├── spec.md              # Feature specification
├── plan.md              # This file
└── tasks.md             # Task decomposition
```

### Source Code (repository root)

```text
# Workflows
.github/
└── workflows/
    ├── ci.yml             # PR時: テスト + インフラ検証
    └── deploy.yml         # mainマージ時: 本番デプロイ

# Application code (existing)
backend/
├── src/
├── tests/
├── package.json
├── tsconfig.json
└── jest.config.js

# Infrastructure (existing)
infra/
├── main.bicep
├── main.json
├── modules/
├── parameters/
└── scripts/
```

**Structure Decision**: ワークフローは2ファイルに分離。`ci.yml`はPR時に動作し、テストとインフラ検証を実行。`deploy.yml`はmainマージ時に動作し、本番環境へデプロイする。個人プロジェクトのため、通知基盤（Slack等）は構築せず、GitHubのChecks欄での確認に留める。

## GitHub Actions Workflow Design

### Workflow 1: CI (ci.yml)

**Trigger**: `pull_request`（opened, synchronize, reopened）

**Jobs**:

| Job | Condition | Steps | Purpose |
|-----|-----------|-------|---------|
| `changes` | 常時 | 変更ファイル検出（dorny/paths-filter） | どのジョブを実行するか判定 |
| `test-backend` | `backend/`変更時 | checkout → setup-node → cache → npm ci → build → test | バックエンドビルド・テスト |
| `validate-infra` | `infra/`変更時 | checkout → az-login → bicep build → validate | インフラ構文検証 |

**Path Filters**:
- `backend/` 変更 → `test-backend` 実行
- `infra/` 変更 → `validate-infra` 実行
- `.github/workflows/` 変更 → 両方実行
- その他（frontend/等）→ `changes`ジョブのみ実行

**Concurrency**:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### Workflow 2: Deploy (deploy.yml)

**Trigger**: `push` to `main`

**Jobs**:

| Job | Needs | Steps | Purpose |
|-----|-------|-------|---------|
| `test` | — | checkout → setup-node → cache → npm ci → build → test | mainマージ前の最終テスト |
| `deploy-infra` | `test` | checkout → az-login → bicep deploy | Azureリソースのデプロイ/更新 |
| `deploy-backend` | `deploy-infra` | checkout → setup-node → build → zip → deploy to App Service | バックエンドコードデプロイ |
| `deploy-frontend` | `deploy-infra` | checkout → setup-node → build → deploy to SWA | フロントエンドコードデプロイ |

**Concurrency**:
```yaml
concurrency:
  group: deploy-prod
  cancel-in-progress: false
```

### Workflow 3: Manual Deploy (deploy.yml — workflow_dispatch)

**Trigger**: `workflow_dispatch`

**Inputs**:
- `environment`: `production`（固定、将来の拡張用）
- `skip-tests`: boolean（テストスキップオプション）

### Required GitHub Secrets

| Secret Name | Description |
|-------------|-------------|
| `AZURE_CREDENTIALS` | Azure Service Principal JSON（`az ad sp create-for-rbac`で作成） |
| `AZURE_SUBSCRIPTION_ID` | AzureサブスクリプションID |
| `AZURE_RESOURCE_GROUP` | デプロイ先のリソースグループ名 |
| `OPENCODE_GO_API_KEY` | OpenCode Go APIキー（バックエンド用） |

### Required GitHub Variables

| Variable Name | Description |
|---------------|-------------|
| `AZURE_LOCATION` | Azureリージョン（例: `japaneast`） |
| `APP_SERVICE_NAME` | App Service名 |
| `STATIC_WEB_APP_NAME` | Static Web App名 |

## Azure Authentication Strategy

個人プロジェクトのため、最もシンプルな認証方式を採用する。

### 方式: Service Principal + Federated Credentials（推奨）

GitHub ActionsからAzureへ安全に認証するため、OpenID Connect（OIDC）ベースのFederated Credentialsを使用する。

```bash
# 1. Service Principal作成
az ad sp create-for-rbac \
  --name "github-actions-opencode-chat" \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<rg-name> \
  --sdk-auth

# 2. Federated Credentials設定（GitHubリポジトリ連携）
az ad app federated-credential create \
  --id <app-id> \
  --parameters '{
    "name": "github-actions-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<owner>/<repo>:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

**採用理由**:
- シークレット（パスワード）の管理が不要
- 期限切れの心配がない
- GitHub Actions公式で推奨されている

### 代替方式: Service Principal Secret（fallback）

Federated Credentialsが使えない場合は、従来のClient Secret方式にフォールバックする。

```yaml
- uses: azure/login@v2
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}
```

## Test Strategy

### CI Test Pyramid

```
      ╱╲
     ╱  ╲     Integration (API endpoints)
    ╱────╲
   ╱  INT  ╲
  ╱────────╲
 ╱   UNIT   ╲  Unit tests (Jest)
╱────────────╲
```

### Test Execution Matrix

| Trigger | Jobs | Test Scope |
|---------|------|------------|
| PR（backend変更） | test-backend | `npm test`（backend/unit） |
| PR（infra変更） | validate-infra | `bicep build` + `validate` |
| PR（両方変更） | test-backend + validate-infra | 全て |
| mainマージ | test → deploy | `npm test`（最終確認） |
| 手動トリガー | deploy（skip-tests可） | 任意 |

### Test Data Strategy

- **Unit tests**: 既存のJest設定をそのまま使用。外部サービス（CosmosDB, OpenCode Go API）はモック化。
- **Integration tests**: 現時点では実装済みのAPIエンドポイントがあれば追加。なけばPhase 2以降で拡張。

## Implementation Phases

### Phase 1: CIワークフロー（PR自動テスト）
- `.github/workflows/ci.yml` 作成
- パスフィルタ設定（backend/変更時のみテスト実行）
- `npm ci` キャッシュ設定
- concurrency制御（同一ブランチの古い実行をキャンセル）
- **検証**: テスト用PRを作成し、ワークフローが正しく動作することを確認

### Phase 2: インフラ検証ワークフロー
- `.github/workflows/ci.yml` にインフラ検証ジョブを追加
- `azure/login` + `bicep build` ステップ
- パスフィルタ設定（infra/変更時のみ検証実行）
- **検証**: Bicepファイルを変更したPRで検証が実行されることを確認

### Phase 3: Azure認証設定
- Service Principal作成
- Federated Credentials設定
- GitHub Secrets登録（`AZURE_CREDENTIALS`等）
- GitHub Variables登録（`AZURE_LOCATION`等）
- **検証**: GitHub ActionsからAzureへログインできることを確認

### Phase 4: デプロイワークフロー（mainマージ時）
- `.github/workflows/deploy.yml` 作成
- mainブランチへのpushトリガー
- 手動トリガー（`workflow_dispatch`）対応
- ジョブ間の依存関係設定（test → deploy-infra → deploy-backend/frontend）
- **検証**: mainマージ後、ワークフローが自動実行されることを確認

### Phase 5: バックエンドデプロイ統合
- App Serviceへのデプロイステップ（`azure/webapps-deploy`）
- デプロイ前のビルド・zip化
- 環境変数の設定（`OPENCODE_GO_API_KEY`等）
- **検証**: mainマージ後、バックエンドが正しくデプロイされることを確認

### Phase 6: フロントエンドデプロイ統合
- Static Web Appへのデプロイステップ（`Azure/static-web-apps-deploy`）
- ビルド成果物のデプロイ
- **検証**: mainマージ後、フロントエンドが正しくデプロイされることを確認

### Phase 7: ブランチ保護ルール設定
- mainブランチへの直接プッシュを禁止
- PRマージ前にCIチェック成功を必須化
- **検証**: mainブランチへの直接プッシュが拒否されることを確認

### Phase 8: 最終検証・ドキュメント更新
- 全ワークフローの動作確認
- エラーハンドリング確認（意図的な失敗ケース）
- `quickstart.md`または`README.md`にCI/CD設定手順を追記
