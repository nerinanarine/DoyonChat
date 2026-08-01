# P2-006: バックエンドを App Service から Azure Functions に変更

## 概要

現在のバックエンドは Azure App Service 上の Node.js + Express で動作している。運用コスト削減とサーバーレススケーリングのため、Azure Functions Node.js v4 の Flex Consumption へ移行する。

P1-006（ユーザーごとにチャットを分ける）を同一リリースで実装し、Functions への本番切替時点で認証済みユーザー間の会話分離も完了させる。

## 背景

### App Service の課題

- 常時起動のため、低トラフィック時もコストが発生する
- Oryx ビルドや `node_modules` を含むデプロイが複雑
- App Service Plan の維持コストが高い

### Functions へ移行する理由

- リクエストに応じたスケーリング
- Flex Consumption によるスケール・トゥ・ゼロ
- Functions Core Tools によるローカル開発
- Node.js v4 プログラミングモデルで HTTP ストリーミングを利用できる

## 受け入れ条件

### API 互換性

1. 以下の既存 API が Functions の HTTP トリガーとして動作する
   - `GET /api/health`
   - `GET /api/models`
   - `GET /api/conversations`
   - `POST /api/conversations`
   - `GET /api/conversations/:id`
   - `DELETE /api/conversations/:id`
   - `PUT /api/conversations/:id/model`
   - `GET /api/conversations/:id/messages`
   - `POST /api/chat`
2. 既存 API の HTTP メソッド、パス、ステータスコード、JSON レスポンス形式を維持する
3. `GET /api/health` だけは認証不要とし、それ以外は Entra ID JWT 認証を必須とする
4. P1-006 の所有権チェックを全 Functions API に適用する
5. 他ユーザー、または `userId` のない旧匿名会話へのアクセスは `404` とする
6. `AUTH_ENABLED=false` のローカル開発時は、匿名の `dev-user` として従来どおり会話を共有できる

### SSE ストリーミング

7. `POST /api/chat` が Functions 上で SSE を返す
8. 下流 SSE の形式を変更しない
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache`
   - `Connection: keep-alive`
   - `data: {"content":"...","done":false}`
   - 最終イベント `data: {"content":"","done":true}`
9. Azure の HTTP 応答時間制約（約230秒）を許容し、通常のチャット応答がその範囲で完了することを確認する
10. SSE をポーリングや WebSocket へ変更しない

### データ保持

11. 既存の Cosmos DB アカウント、データベース、コンテナーを再利用する
12. 移行時に既存の会話・メッセージを削除しない
13. Cosmos DB のパーティションキーを変更しない
   - `conversations`: `/id`
   - `messages`: `/conversationId`
14. `Conversation.userId` は新規作成時に必須とし、既存の `userId` なしデータは認証有効時に一般ユーザーから非表示にする

### ローカル開発・CI/CD

15. `functions/` を `npm install`、ビルドした後、`func start` で起動できる
16. CI で Functions のビルド・単体テスト・API 契約テストが実行される
17. GitHub Actions から Flex Consumption の Function App へデプロイできる
18. フロントエンドは API クライアントを変更せず、`VITE_API_URL` を Functions の URL に変更するだけで動作する

### 本番切替・旧リソース削除

19. App Service と Functions を一時並行稼働させ、ステージングで全 API、認証、所有権、SSE、Cosmos DB を検証する
20. 本番フロントエンドの `VITE_API_URL` を Functions に切り替える
21. 本番切替後、Functions の正常性を確認したうえで以下を削除する
   - 旧 App Service
   - 旧 App Service Plan
22. 本番切替完了後に、App Service URL が利用されていないことを確認する

## 技術選定

| 項目 | 選定 | 理由 |
|------|------|------|
| Functions ランタイム | Node.js 20 | 既存バックエンドと統一 |
| プログラミングモデル | Node.js v4 | TypeScript と HTTP ストリーミングを利用するため |
| ホスティングプラン | Flex Consumption | 新規 Linux サーバーレスの推奨プラン。スケール・トゥ・ゼロに対応 |
| トリガー | HTTP Trigger | 既存 REST API を維持するため |
| Function 認証レベル | anonymous | Entra ID Bearer Token をアプリケーション層で検証するため |
| SSE 実装 | HTTP Streams + ReadableStream | `fetch` ベースの既存フロントエンドと互換性を保つため |
| データストア | 既存 Cosmos DB | データ移行・再作成を避けるため |

## 実装方針

### 1. Functions プロジェクト構造

```text
functions/
├── host.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── .funcignore
├── local.settings.json.example
├── src/
│   ├── index.ts
│   ├── functions/
│   │   ├── health.ts
│   │   ├── models.ts
│   │   ├── conversations.ts
│   │   ├── messages.ts
│   │   └── chat.ts
│   ├── services/
│   │   ├── conversationService.ts
│   │   └── opencodeGo.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── errorHandler.ts
│   ├── db/
│   │   └── index.ts
│   └── types/
│       └── index.ts
└── tests/
    ├── unit/
    └── integration/
```

`local.settings.json` 本体は Git にコミットせず、`local.settings.json.example` を提供する。

Express の `Router` を Functions へ直接適用するアダプターは使用しない。HTTP ハンドラーへ移植し、既存のサービスロジックと API 契約を維持する。

### 2. HTTP ルート

`host.json` の route prefix は `api` とする。各 `app.http` の `route` は `health`、`models`、`conversations` など `/api` を除いた値を設定する。

会話 ID は `{id}` パラメーターで受け取り、以下の操作前に認証済みユーザーとの所有権を確認する。

- 詳細取得
- メッセージ一覧取得
- チャット送信
- モデル変更
- 削除

### 3. 認証・CORS

- 全 HTTP トリガーの `authLevel` は `anonymous`
- `/api/health` は認証処理をスキップ
- それ以外は Entra ID の issuer、audience、署名を検証
- `oid` を `userId` として利用
- `AUTH_ENABLED=false` では `dev-user`
- `FRONTEND_URL` のみ CORS 許可
- `Authorization` と `Content-Type` を許可

Express の `express-jwt` ミドルウェアはそのまま再利用せず、Functions の `HttpRequest` に対応する認証ヘルパーを実装する。ただし、issuer、audience、JWKS、`oid` の検証ルールは P1-005 と同じにする。

### 4. ユーザー別データ分離

新規会話の `userId` はリクエスト本文から取得せず、認証結果から設定する。

認証有効時は、`userId` が一致しない会話または `userId` のない旧匿名会話を `404` として扱う。`AUTH_ENABLED=false` では従来どおり全会話を共有する。

Cosmos DB のパーティションキーは `/id` のまま維持する。`/userId` への変更やコンテナー再作成は今回行わない。

### 5. SSE ストリーミング

`src/index.ts` で HTTP ストリーミングを有効にする。

```typescript
import { app } from '@azure/functions';

app.setup({ enableHttpStream: true });
```

`chat.ts` は OpenCode Go の上流ストリームを読み取り、Functions の `ReadableStream` へ SSE イベントを書き込む。ストリーム完了後、assistant メッセージを Cosmos DB に保存する。

必要な検証環境の最低バージョンは以下とする。

- `@azure/functions` 4.3.0 以上
- Azure Functions Runtime 4.28 以上
- Azure Functions Core Tools 4.0.5530 以上

約230秒の HTTP 応答制約を受け入れる。長時間処理のためのポーリング方式・WebSocket 方式は本項目では実装しない。

### 6. 既存コードの移植

以下のロジックを Functions 用パッケージへ移植する。

- `backend/src/services/conversationService.ts`
- `backend/src/services/opencodeGo.ts`
- `backend/src/db/index.ts`
- `backend/src/types/index.ts`

P1-006 の `userId` フィルターと所有権確認を移植後の Functions 側にも適用する。

App Service は Functions のステージング・本番切替が完了するまで保持し、切替後に削除する。

### 7. Bicep

`infra/modules/functions.bicep` を新規作成する。

Functions 用に以下を定義する。

- Flex Consumption 用サーバーファーム（`FC1` / `FlexConsumption`）
- Function App（Node.js、Linux）
- Functions 実行・デプロイ用 Storage Account
- `FUNCTIONS_WORKER_RUNTIME=node`
- `FUNCTIONS_EXTENSION_VERSION=~4`
- Cosmos DB 接続設定
- OpenCode Go API キー
- Entra ID 認証設定
- `FRONTEND_URL`
- Application Insights 接続設定
- HTTPS 強制
- Static Web App URL に対する CORS

既存の Cosmos DB モジュールの出力を Functions モジュールへ渡し、同じ Cosmos DB を参照する。

`infra/main.bicep` の出力には、少なくとも以下を含める。

- Function App 名
- Function API URL
- フロントエンド URL

移行完了後は `appService` モジュールと旧 App Service Plan を削除する。削除前に Functions への本番切替と動作確認を完了する。

### 8. CI/CD

`ci.yml`:

- `functions/**` の変更を検知
- Functions の `npm ci`
- TypeScript ビルド
- Functions 単体テスト
- API 契約テスト
- Bicep 構文検証

`deploy.yml`:

1. インフラをデプロイ
2. Function App 名・URLを取得
3. Functions をビルド
4. Flex Consumption 対応の Functions デプロイ方式でデプロイ
5. Functions のスモークテスト
6. `VITE_API_URL` を Functions URL に設定してフロントエンドをビルド
7. Static Web Apps へデプロイ

App Service 用のデプロイジョブは、Functions 本番切替が完了するまで保持する。切替後の削除は別ジョブまたは明示的なクリーンアップ工程で行う。

## テスト方針

### Functions 単体テスト

- HTTP ハンドラーの正常系・異常系
- 認証なし・無効トークン・有効トークン
- `AUTH_ENABLED=false`
- 新規会話への `userId` 設定
- 他ユーザーの会話へのアクセスが 404
- 旧匿名データが認証有効時に非表示
- モデル変更・削除・チャット送信の所有権確認

### API 契約テスト

`func start` でローカル起動した Functions に対して、全 API の以下を確認する。

- HTTP メソッド
- `/api` パス
- ステータスコード
- JSON 形式
- 認証動作
- CORS

### SSE テスト

- `text/event-stream` が返る
- 最初のチャンクを受信できる
- `done:false` イベントを受信できる
- 最後に `done:true` を受信できる
- ストリーム完了後に assistant メッセージが保存される
- 230秒以内の応答を許容範囲として確認する

### Cosmos DB データ保持テスト

- 移行前に存在する会話が同じ Cosmos DB に保持される
- Functions から既存コンテナーを参照できる
- パーティションキーが `/id`、`/conversationId` のままである
- 既存の `userId` なしデータが削除されない

### 本番切替確認

- ステージングで全 API と SSE を検証
- 本番 Functions の health check
- 認証ユーザー A/B の会話分離
- フロントエンドが Functions URL を使用していること
- App Service URL へのアクセスが不要になったこと
- App Service と App Service Plan を削除したこと

## 移行計画

| フェーズ | 作業内容 | 備考 |
|---------|---------|------|
| 1 | P1-006 のデータモデル・所有権制御を Express に実装 | `userId`、所有権チェック、旧匿名データ対応 |
| 2 | P1-006 の単体・統合テスト | ユーザー A/B、匿名開発モード |
| 3 | Functions プロジェクト作成 | Node.js v4、Flex 対応構成 |
| 4 | 更新済みサービス・認証・API を Functions へ移植 | Express アダプターは使用しない |
| 5 | Functions の API・SSE・データ保持テスト | `func start` とステージング |
| 6 | Flex Consumption、Storage、Function App を追加 | App Service は維持 |
| 7 | CI/CD を Functions 対応へ更新 | 既存 App Service デプロイは一時維持 |
| 8 | ステージング環境で並行検証 | 認証、所有権、SSE、Cosmos DB |
| 9 | 本番フロントエンドを Functions URL へ切替 | `VITE_API_URL` のみ変更 |
| 10 | 本番 Functions の安定稼働を確認 | 旧 App Service をロールバック用に保持 |
| 11 | App Service と App Service Plan を削除 | 切替完了後の明示的クリーンアップ |

## 関連ファイル

### 新規

- `functions/` ディレクトリ全体
- `infra/modules/functions.bicep`
- Functions 用テスト

### 更新

- `backend/src/types/index.ts`
- `backend/src/services/conversationService.ts`
- `backend/src/routes/conversations.ts`
- `backend/src/routes/chat.ts`
- `backend/tests/`
- `infra/main.bicep`
- `infra/main.json`
- `infra/parameters/*.parameters.json`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `frontend/.env.example`
- `README.md`
- `specs/001-chat-app/quickstart.ja.md`
- `specs/005-entra-id-auth/setup-guide.md`

### 移植元

- `backend/src/services/conversationService.ts`
- `backend/src/services/opencodeGo.ts`
- `backend/src/db/index.ts`
- `backend/src/types/index.ts`

## 注意点・リスク

1. **SSE の HTTP 制約**: 約230秒の制約を受け入れる。超過する長時間処理は本項目の対象外
2. **コールドスタート**: Flex Consumption の初回リクエスト遅延をステージングで計測する
3. **Functions 用 Storage**: 実行・デプロイ用 Storage Account を別途用意する
4. **認証移植**: Express ミドルウェアをそのまま使わず、同じ issuer・audience・JWKS ルールを Functions で実装する
5. **旧匿名データ**: データは保持するが、認証有効時は一般ユーザーへ公開しない
6. **ロールバック**: App Service を本番切替確認まで保持する
7. **App Service 削除**: Functions の正常性とフロントエンド URL 切替を確認してから削除する
8. **P2-007との重複**: CI/CD の一般的な整理や未使用 Secret の削除は P2-007 の範囲とし、ここでは移行に必要な変更だけ行う

## 依存関係

- **前提:** P1-005 Entra ID 認証
- **同時実装:** P1-006 ユーザー別会話分離
- **本番切替条件:** P1-006 の所有権チェック、Functions の全 API、SSE、CI/CD、Flex インフラが完了していること
- **ブロックされる:** なし

## 実装メモ

> 対応後に実装内容・マージコミット・注意点を記載する。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| — | 🟡 仕様確定 | Flex Consumption、本番切替、App Service／Plan削除、P1-006同時実装、230秒制約を確定 |
