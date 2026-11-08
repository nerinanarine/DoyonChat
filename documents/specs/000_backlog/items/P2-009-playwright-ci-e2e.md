# P2-009: Playwright による CI/CD ブラウザテスト導入

## 概要

Playwright を CI/CD に組み込み、フロントエンドの主要なブラウザ動作と Entra ID 認証連携を自動検証する。実テナント認証に依存する試験と、PR ごとに実行する再現可能な smoke test を分離する。

## 方針

### PR / main push で実行する試験

実 Entra ID や秘密情報を使わず、毎回同じ結果になるブラウザ試験を実行する。

- `AUTH_ENABLED=false` の画面表示・基本操作 smoke test
- API route mock を使ったモデル一覧・会話画面の確認
- MSAL の test double を使った Bearer token 付与確認
- Bearer token 付き401時のログアウト処理確認
- token なし401時に不要なログアウトを行わないことの確認

### dev デプロイ後の試験

デプロイされた dev の SWA URL に対して、次を確認する。

- SWA が表示できること
- LoginPage が表示されること
- API URL と CORS が正しいこと
- `/api/health` が正常応答すること
- 未認証の保護 API が401を返すこと

### 実 Entra ID E2E

実テナント・専用テストユーザーを使う試験は、PR の必須チェックにせず、`workflow_dispatch` または nightly 実行とする。

- dev の登録済み redirect URI を持つ SWA URL を対象にする
- サインイン後にアプリへ戻り、LoginPage に戻らないことを確認する
- `/api/models` などに Bearer token が付いて200になることを確認する
- 専用 GitHub Environment と専用テストユーザーを使用する
- MFA、Conditional Access、同意状態などの運用条件を明文化する

## 実装内容

### Playwright

- `frontend/playwright.config.ts` を追加
- `frontend/e2e/` に smoke test と認証/API 契約 test を追加
- Chromium を CI でインストール
- 失敗時の screenshot、trace、HTML report を保存
- token や Authorization header の値をログ・artifact に残さない

### GitHub Actions

- `.github/workflows/frontend-e2e.yml` を追加、または既存 workflow に専用 job を追加
- PR と `main` push では秘密情報なしの deterministic test を実行
- dev デプロイ後に post-deploy smoke test を実行
- 実 Entra E2E は `workflow_dispatch` / nightly 用に分離
- prod の手動デプロイ経路を変更しない

## 受け入れ条件

- [ ] `npm ci` 後に Playwright Chromium をインストールしてテストを実行できる
- [ ] PR で認証なしの frontend smoke test が実行される
- [ ] main push の dev 自動デプロイを壊さない
- [ ] Bearer token の付与をブラウザ試験または認証契約試験で確認できる
- [ ] 401時の logout 処理と token なし401の挙動を確認できる
- [ ] 失敗時に screenshot / trace / report を取得できる
- [ ] PR workflow に Entra の資格情報を渡さない
- [ ] 実 Entra E2E を手動または nightly で実行できる
- [ ] 実 token、パスワード、Authorization header がログやartifactに漏れない
- [ ] prod 手動デプロイの既存トリガーと環境分離を維持する

## リスク・対策

| リスク | 対策 |
|--------|------|
| Entra ログインが MFA / Conditional Access で不安定 | PR では実 Entra を使わず、実 E2E は専用ユーザー・手動/nightly に限定 |
| test user の資格情報漏洩 | GitHub Environment secrets に保存し、PR workflow には渡さない |
| trace に token が含まれる | 実 Entra E2E では trace/artifact の扱いを制限し、値をログ出力しない |
| CosmosDB / OpenCode Go による副作用 | PR test は route mock、実環境試験は読み取り中心から開始 |
| redirect URI 不一致 | 実 E2E は登録済み dev SWA URL を対象にする |

## 関連ファイル

- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/e2e/`
- `.github/workflows/deploy.yml`
- `.github/workflows/frontend-e2e.yml`
- `frontend/src/services/api.ts`
- `frontend/src/auth/msalConfig.ts`
- `specs/005-entra-id-auth/setup-guide.md`

## 依存関係

- P1-005 Entra ID 認証
- dev の SPA / API アプリ登録と権限設定
- dev SWA の redirect URI 設定
