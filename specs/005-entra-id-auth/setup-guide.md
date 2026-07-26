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
| **名前** | `DoyonChat`（任意） |
| **サポートされているアカウントの種類** | 組織のみ: この組織のディレクトリのみに含まれるアカウント（シングル テナント） |
| **リダイレクト URI** | **シングルページアプリケーション (SPA)** を選択 |
| **リダイレクト URI（値）** | `http://localhost:5173`（ローカル開発用） |

> 本番環境では追加で `https://<your-domain>` も登録してください。

4. **登録** をクリック

### 1.3 重要な値の記録

登録後、**概要** ページから以下の値をコピーして保存:

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

### 4.1 フロントエンド

`frontend/.env.local` を作成:

```env
VITE_AUTH_ENABLED=true
VITE_ENTRA_CLIENT_ID=<アプリケーション (クライアント) ID>
VITE_ENTRA_TENANT_ID=<ディレクトリ (テナント) ID>
VITE_ENTRA_REDIRECT_URI=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3000/api
```

### 4.2 バックエンド

`backend/.env` を作成/更新:

```env
PORT=3000
AUTH_ENABLED=true
ENTRA_TENANT_ID=<ディレクトリ (テナント) ID>
ENTRA_CLIENT_ID=<アプリケーション (クライアント) ID>
CORS_ORIGIN=http://localhost:5173
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

1. **認証** → **リダイレクト URI** に本番 URL を追加
   - `https://<your-domain>`
2. **ブランド** → **ホーム ページ URL** を設定（オプション）

### 5.2 環境変数

本番環境の環境変数に以下を設定:

| 変数 | 値 |
|------|-----|
| `ENTRA_CLIENT_ID` | アプリケーション (クライアント) ID |
| `ENTRA_TENANT_ID` | ディレクトリ (テナント) ID |
| `AUTH_ENABLED` | `true` |
| `CORS_ORIGIN` | `https://<your-domain>` |

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

- **原因:** バックエンドの `CORS_ORIGIN` とフロントエンドのオリジンが一致していない
- **対策:** `CORS_ORIGIN` に正しいフロントエンド URL を設定

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
