# P1-005: Entra ID（Azure AD）を利用したユーザー認証

## 概要

DoyonChat に Microsoft Entra ID（旧 Azure AD）による認証を導入する。未ログイン時はログイン画面を表示し、ログイン後は JWT トークンを用いてバックエンド API を保護する。ローカル開発時は認証スキップモードを利用できる。

---

## 背景・目的

- MVP では匿名ユーザーで動作していたが、本番環境では複数ユーザーが利用する前提
- Entra ID を使用することで、組織の既存アカウントで SSO が可能
- 認証後、JWT トークンの `oid`（オブジェクト ID）をユーザー識別子として利用

---

## 受け入れ条件

| # | 条件 |
|---|------|
| 1 | 未ログイン状態でアプリにアクセスすると、ログイン画面または Microsoft ログインボタンが表示される |
| 2 | Microsoft アカウント（Entra ID 組織アカウント）でログインできる |
| 3 | ログイン後、バックエンド API へのすべてのリクエストに有効な `Authorization: Bearer <token>` ヘッダーが含まれる |
| 4 | トークンが無効または期限切れの場合、401 エラーが返され、フロントエンドはログイン画面に戻る |
| 5 | ログアウトボタンから正常にログアウトできる |
| 6 | ローカル開発環境では、`AUTH_ENABLED=false` にすることで認証をスキップし、ダミーユーザーとして動作する |

---

## アーキテクチャ

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   フロントエンド  │  Bearer │   バックエンド   │  JWKS  │   Microsoft    │
│  (React + Vite) │ ───────▶│  (Express API)  │───────▶│   Entra ID     │
│                 │  Token  │                 │ 検証    │                │
└─────────────────┘         └─────────────────┘         └─────────────────┘
        │                           │
        ▼                           ▼
   @azure/msal-react          jwks-rsa + jsonwebtoken
```

### 認証フロー

1. ユーザーが「Microsoft でログイン」ボタンをクリック
2. `msal-react` が Entra ID の認可エンドポイントにリダイレクト
3. 認可コードをフロントエンドに返却（PKCE フロー）
4. `msal-react` がアクセストークンを取得
5. フロントエンドの API リクエストに `Authorization: Bearer <token>` を付与
6. バックエンドがトークンの署名を JWKS で検証
7. 検証成功時、`req.userId = token.oid` を設定して後続処理へ

---

## 技術選定

| レイヤー | ライブラリ/手法 | 理由 |
|---------|---------------|------|
| フロントエンド | `@azure/msal-react` + `@azure/msal-browser` | Microsoft 公式、React 統合あり |
| バックエンド | `jwks-rsa` + `jsonwebtoken` | Entra ID の公開鍵で署名検証、Express ミドルウェアで簡潔に実装 |
| トークン検証 | JWKS エンドポイント動的取得 | キーローテーションに対応 |

### 選定理由: passport-azure-ad → jwks-rsa + jsonwebtoken

`passport-azure-ad` は公式サポート終了が発表されており、後継ライブラリの移行推奨がある。Express でのトークン検証は `jwks-rsa` + `jsonwebtoken` の組み合わせで十分に実装でき、依存も少なくメンテナンスが容易。

---

## 環境変数

### フロントエンド（`.env` / `.env.local`）

| 変数 | 説明 | 例 |
|------|------|-----|
| `VITE_AUTH_ENABLED` | 認証有効フラグ | `true` |
| `VITE_ENTRA_CLIENT_ID` | Entra ID アプリ登録のクライアント ID | `00000000-0000-0000-0000-000000000000` |
| `VITE_ENTRA_TENANT_ID` | テナント ID | `common` または組織のテナント ID |
| `VITE_ENTRA_REDIRECT_URI` | ログイン後のリダイレクト先 | `http://localhost:5173` |
| `VITE_API_URL` | バックエンド API のベース URL | `http://localhost:3000/api` |

### バックエンド（`.env`）

| 変数 | 説明 | 例 |
|------|------|-----|
| `AUTH_ENABLED` | 認証有効フラグ | `true` |
| `ENTRA_TENANT_ID` | テナント ID | `common` または組織のテナント ID |
| `ENTRA_CLIENT_ID` | クライアント ID（audience 検証用）| `00000000-0000-0000-0000-000000000000` |
| `FRONTEND_URL` | フロントエンドのオリジン（CORS 許可用） | `http://localhost:5173` |

> **注意:** ローカル開発時は `AUTH_ENABLED=false` / `VITE_AUTH_ENABLED=false` に設定し、ダミーユーザーモードで動作させる。

---

## フロントエンド実装詳細

### 1. MSAL インスタンス作成

```typescript
// frontend/src/auth/msalConfig.ts
import { PublicClientApplication, Configuration } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);
```

### 2. アプリを MsalProvider でラップ

```typescript
// frontend/src/main.tsx
<MsalProvider instance={msalInstance}>
  <App />
</MsalProvider>
```

### 3. 認証状態判定

```typescript
// frontend/src/App.tsx（簡略化）
const { instance, accounts } = useMsal();
const isAuthenticated = useIsAuthenticated();

if (!isAuthenticated && import.meta.env.VITE_AUTH_ENABLED === 'true') {
  return <LoginPage />;
}
```

### 4. API リクエストに Bearer トークン付与

```typescript
// frontend/src/services/api.ts
const getToken = async (): Promise<string | null> => {
  const account = msalInstance.getAllAccounts()[0];
  if (!account) return null;
  const response = await msalInstance.acquireTokenSilent({
    scopes: ['openid', 'profile'],
    account,
  });
  return response.accessToken;
};

// 各 API 呼び出し時にヘッダーに付与
headers: {
  Authorization: `Bearer ${token}`,
}
```

### 5. 401 レスポンスハンドリング

API レスポンスで 401 を受信した場合、`instance.logoutRedirect()` を呼び出してログアウトし、ログイン画面に戻る。

---

## バックエンド実装詳細

### 1. 認証ミドルウェア

```typescript
// backend/src/middleware/auth.ts
import jwt from 'jsonwebtoken';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

export const authMiddleware = expressjwt({
  secret: jwksClient.getSigningKey as GetVerificationKey,
  algorithms: ['RS256'],
  issuer: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0`,
  audience: process.env.ENTRA_CLIENT_ID,
}).unless({ path: ['/api/health'] });
```

### 2. userId 抽出ミドルウェア

```typescript
// backend/src/middleware/auth.ts（続き）
export const extractUserId = (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.AUTH_ENABLED || process.env.AUTH_ENABLED === 'false') {
    req.userId = 'dev-user';
    return next();
  }
  const auth = req.auth as { oid?: string } | undefined;
  if (!auth?.oid) {
    return res.status(401).json({ error: 'Unauthorized: oid not found' });
  }
  req.userId = auth.oid;
  next();
};
```

### 3. app.ts での登録

```typescript
// backend/src/app.ts
import { authMiddleware, extractUserId } from './middleware/auth';

app.use('/api', authMiddleware);
app.use('/api', extractUserId);
app.use('/api/health', healthRouter); // 認証除外済み
```

### 4. 型拡張

```typescript
// backend/src/types/express.d.ts
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
```

---

## 関連ファイル

| ファイル | 変更内容 |
|---------|---------|
| `frontend/package.json` | `@azure/msal-react`, `@azure/msal-browser` 追加 |
| `frontend/src/main.tsx` | `MsalProvider` でラップ |
| `frontend/src/App.tsx` | 認証状態判定、ログイン画面表示 |
| `frontend/src/services/api.ts` | Bearer トークン付与、401 ハンドリング |
| `frontend/src/services/chatApi.ts` | API 呼び出し時のトークン連携 |
| `frontend/src/components/Auth/LoginPage.tsx` | **新規** ログイン画面 |
| `frontend/src/components/Layout/AppLayout.tsx` | ログアウトボタン追加 |
| `frontend/src/auth/msalConfig.ts` | **新規** MSAL 設定 |
| `backend/package.json` | `express-jwt`, `jwks-rsa`, `jsonwebtoken`, `@types/jsonwebtoken` 追加 |
| `backend/src/middleware/auth.ts` | **新規** JWT 検証 + userId 抽出 |
| `backend/src/middleware/errorHandler.ts` | 401 エラーハンドリング調整 |
| `backend/src/app.ts` | 認証ミドルウェア登録 |
| `backend/src/types/express.d.ts` | **新規** `Request.userId` 型拡張 |
| `backend/src/routes/*.ts` | `req.userId` を利用したユーザー識別（将来拡張） |
| `frontend/.env.example` | 環境変数テンプレート更新 |
| `backend/.env.example` | 環境変数テンプレート更新 |

---

## テスト方針

### フロントエンド

- **単体テスト:** `msal-react` のモック化、ログイン/ログアウト状態での画面表示切り替え
- **統合テスト:** Playwright でログイン後の API 呼び出しに Bearer ヘッダーが付与されることを確認

### バックエンド

- **単体テスト:**
  - 有効な JWT → 200 + `req.userId` に `oid` が設定される
  - 無効な JWT → 401
  - 期限切れ JWT → 401
  - `AUTH_ENABLED=false` → 全リクエストが `dev-user` として通過
- **統合テスト:** `/api/health` は認証なしでアクセス可能

---

## セキュリティ考慮事項

1. **PKCE フロー:** `msal-browser` が自動的に PKCE を使用
2. **トークン保存:** `localStorage` に保存（SPA の標準的な選択）。XSS 対策として CSP ヘッダー推奨
3. **JWKS キャッシュ:** `jwks-rsa` のキャッシュ機能でパフォーマンス最適化
4. **CORS:** フロントエンドのオリジンのみ許可
5. **リダイレクト URI:** 本番環境では HTTPS のみ登録

---

## ロールアウト計画

1. **Phase 1:** ローカル開発環境で `AUTH_ENABLED=false` で動作確認
2. **Phase 2:** Entra ID テストテナントで `AUTH_ENABLED=true` で E2E テスト
3. **Phase 3:** 本番環境に Entra ID アプリ登録を作成し、本番デプロイ

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-07-05 | 🟡 仕様詳細化 | 初期詳細仕様作成 |
