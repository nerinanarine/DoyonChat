# P1-005 セットアップガイド: Entra ID アプリ登録

## 前提条件

- Azure サブスクリプション（または無料の Microsoft アカウント）
- Azure Portal へのアクセス権限

---

## 1. Entra ID アプリ登録の作成

### 1.1 Azure Portal へアクセス

1. [Azure Portal](https://portal.azure.com/) にログイン
2. 左メニューから **Microsoft Entra ID** を選択
3. サイドメニューから **アプリの登録** → **新規登録** をクリック

### 1.2 アプリ登録の設定

| 項目 | 値 |
|------|-----|
| **名前** | `DoyonChat-dev` / `DoyonChat-prod`（環境ごとに1つ作成、任意） |
| **サポートされているアカウントの種類** | 組織のみ: この組織のディレクトリのみに含まれるアカウント（シングル テナント） |
| **リダイレクト URI** | **シングルページアプリケーション (SPA)** を選択 |
| **リダイレクト URI（値）** | `http://localhost:5173`（ローカル開発用） |

> 開発環境（dev）と本番環境（prod）で**別のアプリ登録**を作成します。各登録には、対応する環境の SWA URL をリダイレクト URI として追加登録してください（5章参照）。

4. **登録** をクリック

### 1.3 重要な値の記録

登録後、**概要** ページから以下の値を**環境ごとに**コピーして保存:

| 項目 | 値の例 | 用途 |
|------|--------|------|
| **アプリケーション (クライアント) ID** | `00000000-0000-0000-0000-000000000000` | `ENTRA_CLIENT_ID` |
| **ディレクトリ (テナント) ID** | `00000000-0000-0000-0000-000000000000` | `ENTRA_TENANT_ID` |

---

## 2. API アクセス許可の設定

### 2.1 Microsoft Graph のアクセス許可

1. アプリ登録の **API のアクセス許可** → **アクセス許可の追加** をクリック
2. **Microsoft Graph** → **委任されたアクセス許可** を選択
3. 以下のアクセス許可を追加:
   - `openid`
   - `profile`
   - `User.Read`

### 2.2 管理者の同意

1. **API のアクセス許可** ページで **管理者の同意を与えます** をクリック
2. **はい** をクリックして同意

> テナント管理者が同意しないと、一般ユーザーはログイン時に同意画面が表示されます。

---

## 3. 認証設定の確認

### 3.1 暗黙的フローとハイブリッドフロー

1. **管理** → **認証** を選択
2. **暗黙的な許可およびハイブリッド フロー** セクションで以下を確認:
   - **アクセス トークン** → **チェックなし**（PKCE フローを使用するため）
   - **ID トークン** → **チェックなし**（PKCE フローを使用するため）

> DoyonChat では PKCE フローを使用するため、暗黙的フローは無効のままで問題ありません。

### 3.2 リダイレクト URI

1. **認証** ページの **プラットフォーム構成** セクションを確認
2. SPA プラットフォームに以下が登録されていることを確認:
   - `http://localhost:5173`
   - （本番環境では）`https://<your-domain>`

---

## 4. ローカル開発環境の設定

ローカル開発では **dev** 用アプリ登録のクライアント ID / テナント ID を使用します。

### 4.1 フロントエンド

`frontend/.env.local` を作成:

```env
VITE_AUTH_ENABLED=true
VITE_ENTRA_CLIENT_ID=<アプリケーション (クライアント) ID>
VITE_ENTRA_TENANT_ID=<ディレクトリ (テナント) ID>
VITE_ENTRA_REDIRECT_URI=http://localhost:5173
VITE_API_URL=http://localhost:3000/api
```

### 4.2 バックエンド

`backend/.env` を作成/更新:

```env
PORT=3000
AUTH_ENABLED=true
ENTRA_TENANT_ID=<ディレクトリ (テナント) ID>
ENTRA_CLIENT_ID=<アプリケーション (クライアント) ID>
FRONTEND_URL=http://localhost:5173
```

### 4.3 ダミーユーザーモード（認証スキップ）

認証なしで開発する場合:

```env
# frontend/.env.local
VITE_AUTH_ENABLED=false

# backend/.env
AUTH_ENABLED=false
```

---

## 5. 本番環境の設定

### 5.1 Entra ID アプリ登録の追加設定

1. **認証** → **リダイレクト URI** に各環境の URL を追加
   - dev 用アプリ登録 → dev の SWA URL、prod 用アプリ登録 → prod の SWA URL（各環境の URL の確認方法は 5.3.5 を参照）
2. **ブランド** → **ホーム ページ URL** を設定（オプション）

### 5.2 環境変数

本番環境の環境変数に以下を設定（5.3 の CI/CD 経由で自動設定される。手動設定する場合の値）:

| 変数 | 値 |
|------|-----|
| `ENTRA_CLIENT_ID` | アプリケーション (クライアント) ID |
| `ENTRA_TENANT_ID` | ディレクトリ (テナント) ID |
| `AUTH_ENABLED` | `true` |
| `FRONTEND_URL` | `https://<name>.azurestaticapps.net`（CI/CD で自動設定済み） |

### 5.3 CI/CD（GitHub Actions）の設定

開発環境（dev）と本番環境（prod）で異なる Azure リソースにデプロイするため、GitHub Environments で環境ごとに Secrets / Variables を分離します。

#### 5.3.1 GitHub Environments の作成

1. GitHub リポジトリの **Settings** → **Environments** → **New environment** をクリック
2. `dev` と `prod` の2つを作成
3. （推奨）`prod` には **Required reviewers** を設定し、デプロイ前の承認を必須化

#### 5.3.2 環境ごとの Secrets の登録

各 Environment の **Environment secrets** に以下を登録（リポジトリスコープの同名 Secret より優先されます）:

| Secret | 環境ごとの値 |
|--------|-------------|
| `AZURE_CLIENT_ID` | デプロイ用アプリ登録（OIDC）のクライアント ID |
| `AZURE_TENANT_ID` | テナント ID |
| `AZURE_SUBSCRIPTION_ID` | サブスクリプション ID |
| `AZURE_RESOURCE_GROUP` | 各環境のリソースグループ名 |
| `OPENCODE_GO_API_KEY` | API キー |
| `COSMOSDB_KEY` | 各環境の Cosmos DB キー |
| `SWA_DEPLOYMENT_TOKEN` | 各環境の SWA デプロイトークン |

> **重要:** Environments 作成前に main へ push すると、リポジトリスコープの Secrets（prod 向けの値）で dev デプロイが実行され、prod のリソースグループに dev リソースが作成されてしまいます。必ず先に Environments と環境スコープ Secrets を設定してから push してください。

#### 5.3.3 環境ごとの Variables の登録

各 Environment の **Environment variables** に以下を登録（認証用アプリ登録は環境ごとに異なるため、環境スコープで設定）:

| Variable | dev の値 | prod の値 |
|----------|---------|----------|
| `AUTH_ENABLED` | `true` | `true` |
| `ENTRA_CLIENT_ID` | dev 用アプリ登録のクライアント ID | prod 用アプリ登録のクライアント ID |
| `ENTRA_TENANT_ID` | テナント ID | テナント ID |

> **注意:** Variables 未登録の場合は `AUTH_ENABLED=false` としてデプロイされ、認証なしで動作します。Variables 登録後に再デプロイすると認証が有効化されます。

#### 5.3.4 デプロイの流れ

| トリガー | デプロイ先 |
|---------|-----------|
| main ブランチへの push | **dev**（自動） |
| Actions → Deploy → Run workflow で環境を選択 | 選択した環境（**prod** はここから手動実行） |

デプロイ時の動作:

- **インフラ:** `infra/parameters/<環境>.parameters.json` を使用してデプロイ
- **フロントエンド:** ビルド時に環境スコープ Variables から `VITE_AUTH_ENABLED` / `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_TENANT_ID` を埋め込み。`VITE_ENTRA_REDIRECT_URI` にはインフラ出力の `frontendUrl`（環境ごとの SWA URL）が自動設定されます
- **バックエンド:** 環境ごとの App Service の App Settings に `AUTH_ENABLED` / `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` を設定

#### 5.3.5 各環境の URL の確認方法

1. Azure Portal で対象環境の Static Web Apps リソースを開き、**概要** ページの URL を確認（例: `https://<name>.azurestaticapps.net`）
2. または GitHub Actions の `deploy-infra` ジョブ出力 `frontendUrl` を確認
3. 確認した URL を**対応する環境の** Entra ID アプリ登録のリダイレクト URI（SPA プラットフォーム）に登録

---

## 6. トラブルシューティング

### ログイン後に「アクセスできません」エラー

- **原因:** リダイレクト URI が登録されていない、または SPA プラットフォームとして登録されていない
- **対策:** 認証設定でリダイレクト URI を確認

### 401 Unauthorized（バックエンド）

- **原因:** トークンの audience (`aud`) が一致しない
- **対策:** `ENTRA_CLIENT_ID` がアプリ登録のクライアント ID と一致しているか確認

### 401 Unauthorized（issuer 不一致）

- **原因:** テナント ID が誤っている、またはマルチテナント設定が必要
- **対策:** `ENTRA_TENANT_ID` を確認。マルチテナントの場合は issuer 検証を緩和

### CORS エラー

- **原因:** バックエンドの `FRONTEND_URL` とフロントエンドのオリジンが一致していない
- **対策:** `FRONTEND_URL` に正しいフロントエンド URL を設定

### トークンの取得に失敗

- **原因:** `acquireTokenSilent` が失敗（アカウントが見つからない、同意されていない）
- **対策:**
  - `msalInstance.getAllAccounts()` でアカウントが取得できるか確認
  - API アクセス許可に管理者の同意が与えられているか確認

---

## 7. 参考リンク

- [Microsoft Entra ID ドキュメント](https://learn.microsoft.com/ja-jp/entra/identity/)
- [MSAL React クイックスタート](https://learn.microsoft.com/ja-jp/entra/identity-platform/quickstart-single-page-app-react-sign-in)
- [JWT 検証（JWKS）](https://learn.microsoft.com/ja-jp/entra/identity-platform/access-tokens#validating-tokens)
