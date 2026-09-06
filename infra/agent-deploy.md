# Agent Gateway デプロイ手順（P3-010 Phase 3）

対象: `agentPool` モジュール（ACA環境 + ACR + Container App + Key Vault連携）

## 前提（デプロイ前に一度だけ）

### 1. Entra App 登録（gateway JWT audience 用）

Functions のマネージド ID が取得するトークンは、gateway が検証する。その検証先に使う App 登録が必要。

1. Azure Portal → Microsoft Entra ID → アプリの登録 → 新規登録
   - 名前: `doyonchat-agent-gateway`（例）
   - サポートされるアカウントの種類: この組織ディレクトリのみ
   - リダイレクト URI: 不要
2. 作成後、**アプリケーション (クライアント) ID** を控える → `AGENT_AUTH_AUDIENCE` に渡す
3. （Functions の MI がトークンを取得できるようにするため、アプリ登録の公開設定や API 公開の構成が必要な場合あり。まず実行して、401 が返れば Manager が `functions/` 側でトークン取得コードを確認する）

### 2. 環境変数（シェル側で設定）

| 変数 | 必須 | 説明 |
|------|------|------|
| `OPENCODE_GO_API_KEY` | 必須 | 既存 deploy と同様。gateway の `OPENCODE_API_KEY` として Key Vault secret に格納される |
| `AGENT_AUTH_TENANT` | 必須 | テナント ID（Entra JWT issuer。`main.bicep` の既存 `tenantId` と同値になるはず） |
| `AGENT_AUTH_AUDIENCE` | 必須 | 上記 App 登録のアプリケーション (クライアント) ID |
| `AGENT_ENABLED` | 任意 | `false`（既定・kill switch OFF）でデプロイし、検証後に `true` へ |

## 実行

```bash
AGENT_AUTH_TENANT=<tenant-id> \
AGENT_AUTH_AUDIENCE=<app-registration-client-id> \
AGENT_ENABLED=false \
OPENCODE_GO_API_KEY=<sk-...> \
./infra/scripts/deploy.sh dev
```

PowerShell の場合:

```powershell
$env:AGENT_AUTH_TENANT = "<tenant-id>"
$env:AGENT_AUTH_AUDIENCE = "<app-id>"
$env:AGENT_ENABLED = "false"
$env:OPENCODE_GO_API_KEY = "<sk-...>"
.\infra\scripts\deploy.ps1 dev
```

デプロイ後に出力される `agentGatewayUrl`（`agent-...` Container App の FQDN）と
`containerRegistryName` を控える。

## イメージのビルドとプッシュ（初回・変更時）

```bash
az acr build \
  --registry <containerRegistryName> \
  --image doyonchat-agent-gateway:latest \
  --file agent/Dockerfile \
  agent
```

ACP は admin 無効＋Container App の UAMI（AcrPull）引きのため、認証情報なしで pull できる。

## 疎通確認

```bash
# gateway の生存確認（/health は認証対象外）
curl -s https://<agent-container-app-fqdn>/health
```

## Key Vault secret の扱い

- `main.bicep` の `openCodeGoApiKey`（secure param）→ `keyVault` モジュールが
  `opencode-api-key` secret を作成
- Container App は `keyVaultUrl` ＋ UAMI で取得し、`OPENCODE_API_KEY` として env 注入
- 既存 policy と同様、`tenantId`/`objectId` によるアクセス権を維持しつつ、
  UAMI へ `secrets:get` を追加（`agentPool.bicep`）

## 注意

- `agentAuthTenant` / `agentAuthAudience` が空だと gateway は認証なしで起動する
  （loopback 開発のみ想定）。CI（`.github/workflows/deploy.yml`）は受け渡し＋必須化済み
  （`AGENT_ENABLED=true` 時は AUTH 同時必須もガード）。
- 運用系（App Insights メトリクス、kill switch E2E、初回 npm 展開 latency）は
  `specs/P3-010/plan.md` Phase 3 の残課題。