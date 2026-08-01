# P1-005 セットアップガイド: Entra ID アプリ登録

## 前提条件

- Azure サブスクリプション（または無料の Microsoft アカウント）
- Azure Portal へのアクセス権限

---

## 1. Entra ID アプリ登録の作成

> この章のアプリ登録は**SPA のユーザー認証専用**です。バックエンド API 用のアプリ登録は2章、GitHub Actions からのデプロイ認証用は5.3.2で別途作成します。

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

> 開発環境（dev）と本番環境（prod）で、SPA ユーザー認証用のアプリ登録を**別々に**作成します。リダイレクト URI は SPA 認証用アプリ登録にのみ設定します。対応する API 用アプリ登録は2章を参照してください。

4. **登録** をクリック

### 1.3 重要な値の記録

登録後、**概要** ページから以下の値を**環境ごとに**コピーして保存:

| 項目 | 値の例 | 用途 |
|------|--------|------|
| **アプリケーション (クライアント) ID** | `00000000-0000-0000-0000-000000000000` | `ENTRA_CLIENT_ID`（SPA 認証用） |
| **ディレクトリ (テナント) ID** | `00000000-0000-0000-0000-000000000000` | `ENTRA_TENANT_ID` |

---

## 2. API 用アプリ登録と API アクセス許可の設定

> SPA のユーザー認証用アプリ登録と、バックエンド API 用アプリ登録を分離します。API 用アプリ登録にはリダイレクト URI を設定しません。
>
> **実装前提:** この構成を使用するには、フロントエンドが `VITE_ENTRA_API_CLIENT_ID`、バックエンドが `ENTRA_API_CLIENT_ID` を参照する実装と、GitHub Actions の環境変数マッピングが必要です。これらの実装変更を反映してからデプロイしてください。

### 2.1 API 用アプリ登録の作成

環境ごとに API 用アプリ登録を1つ作成します。

| 環境 | アプリ登録名の例 | 用途 |
|------|-----------------|------|
| dev | `DoyonChat-api-dev` | dev のバックエンド API |
| prod | `DoyonChat-api-prod` | prod のバックエンド API |

1. **アプリの登録** → **新規登録** をクリック
2. アプリ名を入力（例: `DoyonChat-api-dev`）
3. シングルテナントを選択
4. **リダイレクト URI は設定しない**
5. 登録後、概要ページから API 用のクライアント ID を記録

API 用クライアント ID は `ENTRA_API_CLIENT_ID` として使用します。SPA 認証用の `ENTRA_CLIENT_ID` とは異なる値になります。

### 2.2 API の公開（Expose an API）

各環境の API 用アプリ登録で実施します。

1. **API の公開**を開く
2. **アプリケーション ID URI** を設定（既定の `api://<API 用クライアントID>` のままで OK）
3. **スコープの追加**をクリックし、以下を入力:
   - スコープ名: `access_as_user`
   - 同意できるユーザー: **管理者とユーザー**
   - 管理者の同意の表示名 / 説明: `DoyonChat API へのアクセス`
   - 状態: **有効**
4. **追加**をクリック

最終的な API スコープは次の形式です。

```text
api://<API 用クライアントID>/access_as_user
```

必要に応じて、API 用アプリ登録の **API の公開** → **承認済みクライアント アプリケーション**から、対応する SPA 認証用アプリのクライアント ID を追加し、`access_as_user` を選択します。これによりユーザーごとの追加同意を省略できます。

### 2.3 SPA 認証用アプリに API 権限を追加

対応する環境の SPA 認証用アプリに、同じ環境の API 用アプリへの委任されたアクセス許可を追加します。

| SPA 認証用アプリ | 追加する API |
|-----------------|-------------|
| `DoyonChat-dev` | `DoyonChat-api-dev` |
| `DoyonChat-prod` | `DoyonChat-api-prod` |

1. SPA 認証用アプリを開く
2. **API のアクセス許可** → **アクセス許可の追加**
3. **API を使用している組織**を選択
4. API 用アプリ名または API 用クライアント ID で検索
5. 対応する API 用アプリを選択
6. **委任されたアクセス許可** → `access_as_user` を選択
7. **アクセス許可の追加**をクリック

> **注意:** 「マイ API」に表示されない場合があります。その場合は **API を使用している組織**から検索してください。dev の SPA に prod の API を追加したり、prod の SPA に dev の API を追加したりしないでください。

### 2.4 管理者の同意

各 SPA 認証用アプリの **API のアクセス許可**ページで:

1. **管理者の同意を与えます**をクリック
2. **はい**をクリック
3. 対応する API の `access_as_user` の状態が **付与済み**になることを確認

### 2.5 Microsoft Graph のアクセス許可（任意）

現在の DoyonChat は Microsoft Graph を直接呼び出していないため、`User.Read` などの Graph 権限は必須ではありません。ユーザープロフィールを Graph から取得する機能を追加する場合のみ、必要な委任されたアクセス許可を追加してください。

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
VITE_ENTRA_CLIENT_ID=<dev SPA 認証用アプリのクライアントID>
VITE_ENTRA_API_CLIENT_ID=<dev API 用アプリのクライアントID>
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
ENTRA_API_CLIENT_ID=<dev API 用アプリのクライアントID>
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
| `ENTRA_CLIENT_ID` | 各環境の SPA 認証用アプリのクライアント ID |
| `ENTRA_API_CLIENT_ID` | 各環境の API 用アプリのクライアント ID |
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
| `AZURE_CREDENTIALS` | デプロイ用アプリ登録の資格情報 JSON（両環境で共通、下記参照） |
| `AZURE_RESOURCE_GROUP` | 各環境のリソースグループ名 |
| `OPENCODE_GO_API_KEY` | API キー |
| `COSMOSDB_KEY` | 各環境の Cosmos DB キー |
| `SWA_DEPLOYMENT_TOKEN` | 各環境の SWA デプロイトークン |

`AZURE_CREDENTIALS` の形式（デプロイ用アプリ登録の **証明書とシークレット** でクライアントシークレットを発行し、以下の JSON を組み立てる）:

```json
{
  "clientId": "<デプロイ用アプリのクライアントID>",
  "clientSecret": "<クライアントシークレットの値>",
  "subscriptionId": "<サブスクリプションID>",
  "tenantId": "<テナントID>"
}
```

> **デプロイ用アプリ登録について:** ユーザー認証用（1章）とは**別の**アプリ登録を1つ作成し、dev / prod で共有します。以下の設定が必要です:
>
> 1. **クライアントシークレットの発行:** **証明書とシークレット** → **新しいクライアント シークレット** を作成し、表示される**値**をコピー（一度しか表示されません）
> 2. **RBAC:** dev / prod 両方のリソースグループに **共同作成者** ロールを付与
>
> ⚠️ シークレットには有効期限があります（ポータルでは最長2年）。**期限切れ前のローテーション運用**（新シークレット発行 → `AZURE_CREDENTIALS` 更新）が必要です。

> **重要:** Environments 作成前に main へ push すると、リポジトリスコープの Secrets（prod 向けの値）で dev デプロイが実行され、prod のリソースグループに dev リソースが作成されてしまいます。必ず先に Environments と環境スコープ Secrets を設定してから push してください。

#### 5.3.3 環境ごとの Variables の登録

各 Environment の **Environment variables** に以下を登録（SPA 認証用と API 用のアプリ登録が環境ごとに異なるため、環境スコープで設定）:

| Variable | dev の値 | prod の値 |
|----------|---------|----------|
| `AUTH_ENABLED` | `true` | `true` |
| `ENTRA_CLIENT_ID` | dev SPA 認証用アプリのクライアント ID | prod SPA 認証用アプリのクライアント ID |
| `ENTRA_API_CLIENT_ID` | dev API 用アプリのクライアント ID | prod API 用アプリのクライアント ID |
| `ENTRA_TENANT_ID` | テナント ID | テナント ID |

> **注意:** Variables 未登録の場合は `AUTH_ENABLED=false` としてデプロイされ、認証なしで動作します。Variables 登録後に再デプロイすると認証が有効化されます。
>
> `ENTRA_CLIENT_ID` は SPA 認証用、`ENTRA_API_CLIENT_ID` は API 用です。同じ値を設定しないでください。

#### 5.3.4 デプロイの流れ

| トリガー | デプロイ先 |
|---------|-----------|
| main ブランチへの push | **dev**（自動） |
| Actions → Deploy → Run workflow で環境を選択 | 選択した環境（**prod** はここから手動実行） |

デプロイ時の動作:

- **インフラ:** `infra/parameters/<環境>.parameters.json` を使用してデプロイ
- **フロントエンド:** ビルド時に環境スコープ Variables から `VITE_AUTH_ENABLED` / `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_API_CLIENT_ID` / `VITE_ENTRA_TENANT_ID` を埋め込み。`VITE_ENTRA_REDIRECT_URI` にはインフラ出力の `frontendUrl`（環境ごとの SWA URL）が自動設定されます
- **バックエンド:** 環境ごとの App Service の App Settings に `AUTH_ENABLED` / `ENTRA_TENANT_ID` / `ENTRA_API_CLIENT_ID` を設定

認証が有効な場合、`ENTRA_CLIENT_ID` / `ENTRA_API_CLIENT_ID` / `ENTRA_TENANT_ID` のいずれかが未設定だと deploy.yml がデプロイを失敗させます。未設定のまま起動してから401になることを防ぐためのチェックです。

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

- **原因:** トークンの audience (`aud`) が API 用アプリの audience と一致しない
- **対策:** `ENTRA_API_CLIENT_ID` が API 用アプリのクライアント ID と一致し、トークンの audience が `api://<ENTRA_API_CLIENT_ID>` になっているか確認

### 401 Unauthorized（issuer 不一致）

- **原因:** テナント ID が誤っている、またはマルチテナント設定が必要
- **対策:** `ENTRA_TENANT_ID` を確認。マルチテナントの場合は issuer 検証を緩和

### CORS エラー

- **原因:** バックエンドの `FRONTEND_URL` とフロントエンドのオリジンが一致していない
- **対策:** `FRONTEND_URL` に正しいフロントエンド URL を設定

### トークンの取得に失敗

- **原因:** API 用アプリのスコープが未公開、SPA 認証用アプリに API 権限が未追加、または同意されていない
- **対策:**
  - 対応する環境の API 用アプリに `access_as_user` が公開されているか確認
  - SPA 認証用アプリの **API を使用している組織**に API 用アプリが表示されるか確認
  - SPA 認証用アプリに `access_as_user` の委任されたアクセス許可を追加
  - API のアクセス許可に管理者の同意が与えられているか確認
  - `msalInstance.getAllAccounts()` でアカウントが取得できるか確認

---

## 7. 参考リンク

- [Microsoft Entra ID ドキュメント](https://learn.microsoft.com/ja-jp/entra/identity/)
- [MSAL React クイックスタート](https://learn.microsoft.com/ja-jp/entra/identity-platform/quickstart-single-page-app-react-sign-in)
- [JWT 検証（JWKS）](https://learn.microsoft.com/ja-jp/entra/identity-platform/access-tokens#validating-tokens)
