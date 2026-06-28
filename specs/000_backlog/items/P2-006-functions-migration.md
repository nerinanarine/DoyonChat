# P2-006: バックエンドを App Service から Azure Functions に変更

## 概要

現在のバックエンドは Azure App Service（Node.js 常時起動）でホスティングされている。運用コスト削減とサーバーレススケーリングのために、Azure Functions（HTTP トリガー）への移行を検討・実装する。

## 背景

- **App Service の課題**:
  - 常時起動のため、P1v2 プランでも月額約 7,000 円程度かかる
  - 空き時間（深夜など）も課金される
  - Oryx ビルドのタイムアウト問題（B1 では npm install で失敗）
  - esbuild + node_modules のデプロイが複雑

- **Functions のメリット**:
  - 従量課金: リクエストがない時間は課金なし（月額大幅削減）
  - 自動スケーリング: 負荷に応じてインスタンス数が増減
  - コードファースト: Functions Core Tools でローカル開発・デプロイが簡単
  - V4 プログラミングモデルで TypeScript サポートが充実

- **Functions のデメリット**:
  - コールドスタート: 初回リクエストに数秒の遅延
  - SSE ストリーミングのサポートが制限的（HTTP レスポンスストリーミングは可能だが、App Service より複雑）
  - CosmosDB 接続のための接続文字列管理が必要
  - 最大実行時間: Consumption プランでは 10 分（十分）

## 受け入れ条件

1. すべての既存 API エンドポイントが Functions HTTP トリガーとして動作する
   - `GET /api/health`
   - `GET /api/models`
   - `GET /api/conversations`
   - `POST /api/conversations`
   - `DELETE /api/conversations/:id`
   - `GET /api/conversations/:id/messages`
   - `POST /api/chat`（SSE ストリーミング）
2. SSE ストリーミングが Functions 上でも正常に動作する
3. フロントエンドの API ベース URL を変更するだけで動作する（`/api` → `https://<func-name>.azurewebsites.net/api`）
4. ローカル開発環境で `func start` で起動・デバッグできる
5. CI/CD（GitHub Actions）が Functions 向けに更新される
6. App Service からの移行時に、既存の CosmosDB データは失われない

## 技術選定

| 項目 | 選定 | 理由 |
|------|------|------|
| Functions ランタイム | Node.js 20 | 既存のバックエンドと同じ |
| プログラミングモデル | v4 | TypeScript サポートが最も充実 |
| ホスティングプラン | Consumption | コスト最適。ストリーミングが問題なら Premium に変更 |
| トリガー | HTTP Trigger | REST API として必要なすべてのエンドポイントをカバー |

## 実装方針

### 1. 新規プロジェクト構造

```
functions/
├── host.json
├── local.settings.json
├── package.json
├── tsconfig.json
└── src/
    ├── functions/
    │   ├── health.ts
    │   ├── models.ts
    │   ├── conversations.ts
    │   ├── messages.ts
    │   └── chat.ts
    ├── services/
    │   ├── conversationService.ts  # 既存から移植
    │   └── opencodeGo.ts           # 既存から移植
    ├── middleware/
    │   ├── auth.ts                 # P1-005 実装後
    │   └── errorHandler.ts         # 既存から移植
    ├── db/
    │   └── index.ts                # 既存から移植
    └── types/
        └── index.ts                # 既存から移植
```

### 2. Functions v4 のコード例

```typescript
// src/functions/chat.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@@azure/functions';
import { Readable } from 'stream';

export async function chatHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const { conversationId, message, imageBase64 } = await request.json() as ChatRequest;

  // SSE ストリーミング用の Readable ストリーム
  const stream = new Readable({ read() {} });

  // OpenCode Go API 呼び出し（非同期）
  callOpenCodeGoStream(conversationId, message, imageBase64, {
    onChunk: (chunk) => stream.push(`data: ${JSON.stringify(chunk)}\n\n`),
    onDone: () => stream.push(null),
    onError: (err) => stream.destroy(err),
  });

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    body: stream,
  };
}

app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: chatHandler,
});
```

### 3. SSE ストリーミングの考慮事項

Functions の HTTP トリガーは Node.js の `Readable` ストリームを `body` に渡せるが、以下の注意点がある：

- **Consumption プラン**: レスポンスストリーミングはサポートされているが、クライアント接続が長時間続くとタイムアウトする可能性がある
- **解決策**: Premium プラン（最低インスタンス1）にするか、App Service のままにする
- または、SSE をポーリング方式に変更する（大規模変更）

### 4. 既存コードの再利用

`backend/src/services/`、`backend/src/db/`、`backend/src/types/` はそのまま移植可能。Express 固有の部分（`req`, `res`, `next`, `router`）だけを Functions 形式に書き換える。

### 5. Bicep テンプレートの追加

`infra/modules/functions.bicep` を新規作成：

```bicep
param functionAppName string
param location string
param appServicePlanName string
param storageAccountName string
param cosmosDbEndpoint string
param cosmosDbKey string
param opencodeGoApiKey string

resource functionApp 'Microsoft.Web/sites@@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      appSettings: [
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'COSMOSDB_ENDPOINT', value: cosmosDbEndpoint }
        { name: 'COSMOSDB_KEY', value: cosmosDbKey }
        { name: 'OPENCODE_GO_API_KEY', value: opencodeGoApiKey }
      ]
    }
  }
}
```

## 移行計画

| フェーズ | 作業内容 | 備考 |
|---------|---------|------|
| 1 | Functions プロジェクト作成・ローカル動作確認 | 既存コードを移植 |
| 2 | SSE ストリーミングの動作検証 | Consumption プランで問題なければ継続 |
| 3 | Bicep テンプレート更新 | `infra/modules/functions.bicep` 追加 |
| 4 | ステージング環境に Functions をデプロイ | 並行運用（App Service は維持） |
| 5 | フロントエンドの API URL を Functions に切り替え | `VITE_API_URL` 変更 |
| 6 | E2E テストで回帰テスト | すべての機能が正常に動作することを確認 |
| 7 | 本番環境に Functions をデプロイ | App Service はバックアップとして維持 |
| 8 | App Service 削除・リソースクリーンアップ | コスト削減完了 |

## 関連ファイル

- 新規: `functions/` ディレクトリ全体
- 新規: `infra/modules/functions.bicep`
- 更新: `infra/main.bicep`（Functions リソース追加）
- 更新: `.github/workflows/deploy.yml`（Functions デプロイジョブ追加）
- 移植元: `backend/src/services/conversationService.ts`
- 移植元: `backend/src/services/opencodeGo.ts`
- 移植元: `backend/src/db/index.ts`
- 移植元: `backend/src/types/index.ts`

## 注意点・リスク

1. **SSE ストリーミングの互換性**: Functions Consumption プランで長時間 SSE が不安定な場合、Premium プランに変更が必要（コスト増）
2. **コールドスタート**: 初回リクエストに 2〜5 秒の遅延。プレミアムプラン or Always On で回避
3. **移行中のダウンタイム**: 並行運用（App Service + Functions）でリスクを回避
4. **環境変数の移行**: App Service のアプリケーション設定 → Functions のアプリケーション設定へ手動移行が必要

## 依存関係

- **ブロックする:** なし
- **ブロックされる:** なし（独立して実装可能）

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
