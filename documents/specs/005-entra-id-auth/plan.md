# P1-005 実装計画: Entra ID 認証

## タスク一覧

### Phase 1: バックエンド実装

#### 1.1 依存関係追加
- **ファイル:** `backend/package.json`
- **内容:** `express-jwt`, `jwks-rsa`, `jsonwebtoken`, `@types/jsonwebtoken` を追加
- **工数:** 0.25h

#### 1.2 認証ミドルウェア作成
- **ファイル:** `backend/src/middleware/auth.ts`（新規）
- **内容:**
  - JWKS クライアント設定
  - `expressjwt` ミドルウェア（署名検証、issuer/API アプリの audience 検証）
  - `extractUserId` ミドルウェア（`req.userId = token.oid`）
  - `AUTH_ENABLED=false` 時のダミーユーザー対応
- **工数:** 1h

#### 1.3 Express 型拡張
- **ファイル:** `backend/src/types/express.d.ts`（新規）
- **内容:** `Express.Request` に `userId?: string` を追加
- **工数:** 0.25h

#### 1.4 app.ts でミドルウェア登録
- **ファイル:** `backend/src/app.ts`
- **内容:** `/api` ルートに `authMiddleware` と `extractUserId` を適用（`/api/health` 除く）
- **工数:** 0.5h

#### 1.5 エラーハンドリング調整
- **ファイル:** `backend/src/middleware/errorHandler.ts`
- **内容:** `UnauthorizedError`（express-jwt）のハンドリングを追加し、401 レスポンスを返す
- **工数:** 0.5h

#### 1.6 バックエンド単体テスト
- **ファイル:** `backend/tests/unit/auth.test.ts`（新規）
- **内容:**
  - 有効な JWT → 200
  - 無効な JWT → 401
  - 期限切れ JWT → 401
  - `AUTH_ENABLED=false` → `dev-user` で通過
  - `/api/health` → 認証なしで 200
- **工数:** 1.5h

---

### Phase 2: フロントエンド実装

#### 2.1 依存関係追加
- **ファイル:** `frontend/package.json`
- **内容:** `@azure/msal-react`, `@azure/msal-browser` を追加
- **工数:** 0.25h

#### 2.2 MSAL 設定ファイル作成
- **ファイル:** `frontend/src/auth/msalConfig.ts`（新規）
- **内容:**
  - `PublicClientApplication` インスタンス作成
  - `auth.clientId`, `authority`, `redirectUri` を環境変数から設定
  - `cache.cacheLocation = 'localStorage'`
- **工数:** 0.5h

#### 2.3 Vite 環境変数型定義
- **ファイル:** `frontend/src/vite-env.d.ts`
- **内容:** `ImportMetaEnv` に `VITE_AUTH_ENABLED`, `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_API_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`, `VITE_ENTRA_REDIRECT_URI` を追加
- **工数:** 0.25h

#### 2.4 main.tsx で MsalProvider ラップ
- **ファイル:** `frontend/src/main.tsx`
- **内容:** アプリ全体を `MsalProvider` でラップ
- **工数:** 0.25h

#### 2.5 ログイン画面作成
- **ファイル:** `frontend/src/components/Auth/LoginPage.tsx`（新規）
- **内容:**
  - Microsoft でログインボタン
  - `useMsal` フックで `loginRedirect()` を呼び出し
- **工数:** 0.5h

#### 2.6 App.tsx で認証状態判定
- **ファイル:** `frontend/src/App.tsx`
- **内容:**
  - `useIsAuthenticated()` でログイン状態を判定
  - `VITE_AUTH_ENABLED !== 'true'` の場合は常にメイン画面
  - 未ログイン時は `<LoginPage />` を表示
- **工数:** 0.5h

#### 2.7 API サービスのトークン連携
- **ファイル:** `frontend/src/services/api.ts`
- **内容:**
  - `getToken()` ヘルパー関数（`api://<API_CLIENT_ID>/access_as_user` を使った `acquireTokenSilent`）
  - API 呼び出し時に `Authorization: Bearer <token>` を付与
  - 401 レスポンス時に `logoutRedirect()` を呼び出し
- **工数:** 1h

#### 2.8 AppLayout にログアウトボタン追加
- **ファイル:** `frontend/src/components/Layout/AppLayout.tsx`
- **内容:**
  - `useMsal` フックで `instance.logoutRedirect()` を呼び出すログアウトボタン
  - ユーザー名（トークンから取得）の表示（オプション）
- **工数:** 0.5h

#### 2.9 フロントエンド単体テスト
- **ファイル:** `frontend/src/components/Auth/LoginPage.test.tsx`（新規）
- **内容:**
  - `msal-react` のモック化
  - 未ログイン時にログイン画面が表示される
  - ログイン後にメイン画面が表示される
- **工数:** 1h

---

### Phase 3: 環境変数・ドキュメント

#### 3.1 フロントエンド環境変数テンプレート
- **ファイル:** `frontend/.env.example`
- **内容:** 新規環境変数を追加
- **工数:** 0.25h

#### 3.2 バックエンド環境変数テンプレート
- **ファイル:** `backend/.env.example`
- **内容:** 新規環境変数を追加
- **工数:** 0.25h

#### 3.3 README 更新
- **ファイル:** `README.md`
- **内容:** 認証機能の概要、環境変数設定方法、ローカル開発手順を追加
- **工数:** 0.5h

---

### Phase 4: テスト・統合

#### 4.1 E2E テスト（Playwright）
- **ファイル:** `frontend/e2e/auth.spec.ts`（新規）
- **内容:**
  - 未ログイン時にログイン画面が表示される
  - ダミーモード時にメイン画面が表示される（AUTH_ENABLED=false）
- **工数:** 1h

#### 4.2 手動動作確認
- **内容:**
  - `AUTH_ENABLED=false` でローカル開発モード確認
  - `AUTH_ENABLED=true` + テストテナントで E2E 確認
- **工数:** 1h

---

## 工数見積もり

| Phase | 内容 | 見積工数 |
|-------|------|---------|
| Phase 1 | バックエンド実装 | 4.0h |
| Phase 2 | フロントエンド実装 | 4.25h |
| Phase 3 | 環境変数・ドキュメント | 1.0h |
| Phase 4 | テスト・統合 | 2.0h |
| **合計** | | **11.25h** |

---

## 依存関係

```
1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6
2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8 → 2.9
1.4 と 2.7 が完了後 → 4.1, 4.2
```

---

## リスク・懸念事項

| リスク | 対策 |
|--------|------|
| Entra ID テナントがない | ローカル開発ではダミーモードで動作。テスト時は無料の Microsoft アカウントで動作確認 |
| `msal-react` と React 18 の互換性 | 公式ドキュメントで確認済み。互換性あり |
| JWKS エンドポイントの一時的な不通 | `jwks-rsa` のキャッシュ機能で対応。異常時は 401 を返す |
| 既存 API への影響 | `/api/health` 以外は全て認証必須に変更。影響範囲は限定 |

---

## 完了条件

- [ ] 全タスク完了
- [ ] バックエンド単体テスト全パス
- [ ] フロントエンド単体テスト全パス
- [ ] E2E テスト全パス
- [ ] `AUTH_ENABLED=false` でローカル開発が正常に動作
- [ ] `AUTH_ENABLED=true` で Entra ID ログインが正常に動作
