# P1-005: Entra ID（Azure AD）を利用したユーザー認証

## 概要

現在の DoyonChat は匿名ユーザーで動作している。本番運用やチーム利用を見据え、Microsoft Entra ID（旧 Azure AD）を利用した認証を導入する。バックエンドの API を保護し、フロントエンドにログイン/ログアウト UI を追加する。

## 背景

- MVP では認証なし（匿名）で実装したが、本番環境では複数ユーザーが利用する前提
- Entra ID を使用することで、組織の既存アカウントで SSO が可能
- 認証後、JWT トークン（ID トークンまたはアクセストークン）をバックエンドで検証し、ユーザー識別子（`oid`）を取得する

## 受け入れ条件

1. 未ログイン状態でアプリにアクセスすると、ログイン画面または Microsoft ログインボタンが表示される
2. Microsoft アカウントでログインできる（Entra ID 組織アカウント）
3. ログイン後、バックエンド API へのすべてのリクエストに有効なトークンが含まれる
4. トークンが無効または期限切れの場合、401 エラーが返され、フロントエンドはログイン画面に戻る
5. ログアウトボタンから正常にログアウトできる
6. ローカル開発環境では、認証をスキップするモード（ダミーユーザー）がある

## 技術選定

| レイヤー | ライブラリ/手法 | 理由 |
|---------|---------------|------|
| フロントエンド | `@azure/msal-react` + `@azure/msal-browser` | Microsoft 公式、React 統合あり |
| バックエンド | `passport-azure-ad` または JWKS 検証 | Express ミドルウェアでトークン検証 |
| トークン検証 | `jwks-rsa` + `jsonwebtoken` | Entra ID の公開鍵で署名検証 |

## 実装方針

### フロントエンド

1. `msal-react` の `MsalProvider` でアプリをラップ
2. `useMsal` フックでログイン状態を管理
3. API リクエスト時に `Authorization: Bearer <token>` ヘッダーを付与
4. 401 レスポンスを受信したらログイン画面にリダイレクト

### バックエンド

1. `JWTStrategy` ミドルウェアを作成し、すべての `/api/*` ルートに適用（`/api/health` 除く）
2. Entra ID の JWKS エンドポイントから公開鍵を取得して署名検証
3. 検証済みトークンから `oid`（オブジェクト ID）を抽出し、`req.userId` に設定
4. 未認証リクエストには 401 を返す

### 環境変数追加

| 変数 | 説明 |
|------|------|
| `ENTRA_CLIENT_ID` | Entra ID アプリ登録のクライアント ID |
| `ENTRA_TENANT_ID` | テナント ID（組織の場合）または `common` |
| `ENTRA_REDIRECT_URI` | ログイン後のリダイレクト先（フロントエンド URL） |
| `AUTH_ENABLED` | `true` で認証有効、`false` で開発用匿名モード |

## 関連ファイル

- `frontend/src/main.tsx`（MsalProvider ラップ）
- `frontend/src/App.tsx`（認証状態判定）
- `frontend/src/services/api.ts`（Bearer トークン付与）
- `backend/src/middleware/auth.ts`（新規）
- `backend/src/app.ts`（ミドルウェア登録）

## 依存関係

- **ブロックする:** P1-006（ユーザーごとにチャットを分ける）
- **ブロックされる:** なし

## 実装メモ

### 実装内容

- **フロントエンド:**
  - `@azure/msal-react` + `@azure/msal-browser` を導入
  - `MsalProvider` でアプリをラップ (`main.tsx`)
  - `useIsAuthenticated` で認証状態を判定し、未ログイン時は `LoginPage` を表示 (`App.tsx`)
  - API リクエスト時に `acquireTokenSilent` でトークンを取得し `Authorization: Bearer` ヘッダーを付与 (`services/api.ts`)
  - 401 レスポンスを受信したら `logoutRedirect()` を呼び出し (`services/api.ts`)
  - `AppLayout` にログアウトボタンを追加

- **バックエンド:**
  - `express-jwt` + `jwks-rsa` + `jsonwebtoken` を導入
  - `auth.ts` ミドルウェアを新規作成: JWKS による署名検証、`req.userId` への `oid` 設定
  - `/api/*` ルートに認証ミドルウェアを適用（`/api/health` 除く）
  - `AUTH_ENABLED=false` 時はダミーユーザー (`dev-user`) として通過
  - `errorHandler` で `UnauthorizedError` を 401 でハンドリング

### ブランチ

- `P1-005-entra-id-auth`

### 注意点

- Docker 環境内で `npm install` に時間がかかる（ネットワーク/ディスク I/O 制約）
- `backend/package-lock.json` は復元済み
- テスト実行はローカル環境で `npm install` 完了後に実施推奨

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-07-05 | 🟡 実装中 | バックエンド・フロントエンド実装完了 |
| 2026-08-01 | 🟢 対応済み | SPA/API アプリ分離、MSAL/JWT 認証、API 保護、dev/prod CI/CD、Entra v2 audience 対応、セットアップガイド更新完了 |
