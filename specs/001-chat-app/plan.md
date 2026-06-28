# Implementation Plan: OpenCode Go Chat Web App

**Branch**: `[001-opencode-chat]` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-chat-app/spec.md`

## Summary

OpenCode Go APIを利用した対話型チャットWebアプリ。React（Vite）フロントエンド + Node.js/Expressバックエンド + Azure CosmosDBの構成。Azure上にデプロイ。MVPではテキストチャット、ストリーミング応答、複数会話管理、Markdownレンダリング、画像入力、レスポンシブデザインを実装する。

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.4, React 18

**Primary Dependencies**:
- **Frontend**: React 18, Vite 5, Tailwind CSS, react-markdown, react-syntax-highlighter, lucide-react
- **Backend**: Express 4, cors, dotenv, @azure/cosmos (CosmosDB SDK)
- **API**: OpenCode Go API (OpenAI-compatible Chat Completions with SSE streaming)

**Storage**: Azure CosmosDB (Core API / SQL API)

**Testing**: Vitest (frontend), Jest (backend), Playwright (E2E)

**Target Platform**: Azure (Static Web Apps + App Service + CosmosDB)

**Project Type**: Web application (frontend + backend)

**Performance Goals**: 
- Time to First Token < 3s
- API response streaming < 500ms latency per chunk
- Frontend initial load < 2s

**Constraints**:
- APIキーはバックエンドで管理（フロントエンドから隠蔽）
- 画像アップロードは5MB以下、Base64エンコードで直接API転送
- MVPでは匿名ユーザー（認証なし）

**Scale/Scope**: 個人〜小規模チーム利用。同時接続数〜100程度を見込む。

## Constitution Check

- [x] 単一のフロントエンド（React）— 複数フロントエンドではない
- [x] 単一のバックエンド（Express）— 複数バックエンドではない
- [x] 単一のデータベース（CosmosDB）— 複数DBではない
- [x] 各フェーズは独立してテスト可能
- [x] ユーザーストーリーは優先順位付けされ、独立して実装可能

## Project Structure

### Documentation (this feature)

```text
specs/001-chat-app/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # OpenCode Go API research
├── data-model.md        # Database schema
├── quickstart.md        # Local setup guide
└── tasks.md             # Task decomposition
```

### Source Code (repository root)

```text
# Web application (frontend + backend)
frontend/
├── src/
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   └── ChatMessageList.tsx
│   │   ├── Sidebar/
│   │   │   └── ConversationList.tsx
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx
│   │   └── Markdown/
│   │       ├── MarkdownRenderer.tsx
│   │       └── CodeBlock.tsx
│   ├── hooks/
│   │   ├── useChat.ts
│   │   └── useConversations.ts
│   ├── services/
│   │   ├── api.ts
│   │   └── chatApi.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js

backend/
├── src/
│   ├── routes/
│   │   ├── chat.ts
│   │   ├── conversations.ts
│   │   └── models.ts
│   ├── services/
│   │   ├── opencodeGo.ts
│   │   └── conversationService.ts
│   ├── db/
│   │   ├── index.ts
│   │   └── init.ts
│   ├── middleware/
│   │   └── errorHandler.ts
│   ├── types/
│   │   └── index.ts
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── integration/
│   └── unit/
├── package.json
├── tsconfig.json
└── .env.example

# Infrastructure (Azure)
infra/
├── main.bicep
└── parameters.json
```

**Structure Decision**: フロントエンドとバックエンドを完全に分離。フロントエンドはAzure Static Web Apps、バックエンドはAzure App Serviceでホスティング。データベースはAzure CosmosDB。

## OpenCode Go API Research

### API Endpoint

```
POST https://opencode.ai/zen/go/v1/chat/completions
Authorization: Bearer {OPENCODE_GO_API_KEY}
Content-Type: application/json
```

### Request Body (Streaming)

```json
{
  "model": "kimi-k2.6",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

### Request Body (Multimodal)

```json
{
  "model": "glm-5.1",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What is in this image?" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,....." } }
      ]
    }
  ],
  "stream": true
}
```

### Response (SSE Streaming)

```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"}}]}

data: [DONE]
```

### Key Models (OpenCode Go)

| Model ID | Display Name | Quality | Speed | Cost | Multimodal | Context | Best For |
|----------|-------------|---------|-------|------|------------|---------|----------|
| `kimi-k2.6` | Kimi K2.6 | ★★★★★ | Fast | ★★☆ | No | 256K | Complex coding, general tasks |
| `kimi-k2.7-code` | Kimi K2.7 Code | ★★★★★ | Fast | ★★☆ | No | 256K | Advanced coding assistant |
| `kimi-k2.5` | Kimi K2.5 | ★★★★☆ | Fast | ★★☆ | No | 256K | Balanced performance |
| `glm-5.2` | GLM-5.2 | ★★★★★ | Medium | ★☆☆ | Yes | ~128K | Latest GLM with image analysis |
| `glm-5.1` | GLM-5.1 | ★★★★★ | Medium | ★☆☆ | Yes | ~128K | Best quality, image analysis |
| `glm-5` | GLM-5 | ★★★★☆ | Medium | ★☆☆ | No | ~128K | Reasoning, planning |
| `deepseek-v4-pro` | DeepSeek V4 Pro | ★★★★★ | Medium | ★☆☆ | No | 1M | Coding, agent workflows, max thinking |
| `deepseek-v4-flash` | DeepSeek V4 Flash | ★★★★☆ | Fast | ★★☆ | No | 1M | Fast coding, background tasks |
| `qwen3.7-max` | Qwen 3.7 Max | ★★★★☆ | Medium | ★★☆ | No | ~128K | Best Qwen model |
| `qwen3.7-plus` | Qwen 3.7 Plus | ★★★★☆ | Fast | ★★☆ | No | ~128K | Enhanced general coding |
| `qwen3.6-plus` | Qwen 3.6 Plus | ★★★☆☆ | Fast | ★★★☆ | No | ~128K | General coding |
| `qwen3.5-plus` | Qwen 3.5 Plus | ★★☆☆☆ | Very Fast | ★★★★★ | No | ~128K | Simple tasks, bulk operations |
| `minimax-m3` | MiniMax M3 | ★★★☆☆ | Medium | ★★★☆ | No | 1M | Latest MiniMax model |
| `minimax-m2.7` | MiniMax M2.7 | ★★★☆☆ | Medium | ★★★☆ | No | ~128K | Balanced quality/cost |
| `minimax-m2.5` | MiniMax M2.5 | ★★☆☆☆ | Fast | ★★★★☆ | No | 1M | Long context on budget |
| `mimo-v2.5-pro` | MiMo-V2.5 Pro | ★★★★☆ | Medium | ★★☆ | No | ~128K | High quality general |
| `mimo-v2.5` | MiMo-V2.5 | ★★★☆☆ | Medium | ★★★☆ | No | ~128K | Balanced performance |
| `hy3-preview` | Hy3 Preview | ★★★☆☆ | Medium | ★★★☆ | No | ~128K | Experimental model |

### Model Selection Rules

- **Default model**: `kimi-k2.6` (best balance of quality and speed)
- **Image upload**: `glm-5.2` and `glm-5.1` support multimodal input
- **Model per conversation**: Each conversation stores its selected model; switching model mid-conversation applies to subsequent messages only
- **Backend config**: `OPENCODE_GO_MODEL` env var sets the default; user can override per conversation

## CosmosDB Container Design

### Database: `chatdb`

### Container: `conversations`
- **Partition key**: `/id` (each conversation is its own logical partition)
- **Documents**: JSON
- **TTL**: Disabled

```json
{
  "id": "uuid-string",
  "title": "New Chat",
  "model": "kimi-k2.6",
  "createdAt": "2026-06-06T10:00:00Z",
  "updatedAt": "2026-06-06T10:00:00Z"
}
```

### Container: `messages`
- **Partition key**: `/conversationId` (all messages in a conversation share a partition)
- **Documents**: JSON
- **TTL**: Disabled

```json
{
  "id": "uuid-string",
  "conversationId": "uuid-string",
  "role": "user",
  "content": "Hello!",
  "imageUrl": "data:image/png;base64,...",
  "createdAt": "2026-06-06T10:00:00Z"
}
```

### Design Rationale
- `messages` uses `/conversationId` as partition key to co-locate all messages of a conversation. This makes `SELECT * FROM c WHERE c.conversationId = 'xxx'` a single-partition query (low RU, high performance).
- `conversations` uses `/id` as partition key. Listing all conversations is a cross-partition query but expected volume is small (<1000 per user).
- No foreign key constraints (CosmosDB is schema-less). Application-level cleanup: when deleting a conversation, query and delete all messages with that `conversationId`.

## API Design (Backend)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | チャットメッセージを送信し、AI応答をストリーミングで返す |
| GET | `/api/conversations` | 会話一覧を取得 |
| POST | `/api/conversations` | 新しい会話を作成 |
| DELETE | `/api/conversations/:id` | 会話を削除（関連メッセージも削除） |
| GET | `/api/conversations/:id/messages` | 会話のメッセージ一覧を取得 |
| PUT | `/api/conversations/:id/model` | 会話のモデルを変更 |
| GET | `/api/models` | 利用可能なモデル一覧を取得 |

### POST /api/chat

Request:
```json
{
  "conversationId": "uuid",
  "message": "Hello!",
  "imageBase64": "data:image/png;base64,..." // optional
}
```

Response: SSE stream

## Azure Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Azure Cloud                         │
│  ┌─────────────────┐    ┌───────────────────────────┐  │
│  │  Static Web Apps│    │      App Service          │  │
│  │  (React SPA)    │◄──►│  (Node.js + Express)      │  │
│  │  HTTPS/Custom   │    │  API Routes               │  │
│  │  Domain         │    │  CORS: SWA origin only    │  │
│  └─────────────────┘    └───────────┬───────────────┘  │
│                                     │                   │
│                                     ▼                   │
│                           ┌─────────────────┐         │
│                           │  Azure CosmosDB  │         │
│                           │  (Core API)      │         │
│                           │  chatdb database │         │
│                           └─────────────────┘         │
│                                     │                   │
│                                     ▼                   │
│                           ┌─────────────────┐         │
│                           │  OpenCode Go    │         │
│                           │  API (External) │         │
│                           └─────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### Environment Variables

**Backend (.env)**:
```
PORT=3000
COSMOSDB_ENDPOINT=https://<account-name>.documents.azure.com:443/
COSMOSDB_KEY=<primary-key>
COSMOSDB_DATABASE=chatdb
OPENCODE_GO_API_KEY=sk-opencode-...
OPENCODE_GO_MODEL=kimi-k2.6
FRONTEND_URL=https://<swa-name>.azurestaticapps.net
```

**Frontend (.env)**:
```
VITE_API_URL=https://<app-service-name>.azurewebsites.net/api
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 2 projects (frontend + backend) | APIキー隠蔽とストリーミングプロキシが必要 | クライアントサイドのみではAPIキー漏洩リスク |
| CosmosDB | 会話履歴の永続化が必要 | ローカルストレージでは複数デバイス同期不可、Azure前提でPaaS DBを活用 |
| SSE streaming proxy | ブラウザからOpenCode Go APIを直接呼ぶとCORS + APIキー問題 | バックエンドプロキシが必須 |

## IaC Strategy (Infrastructure as Code)

### Bicep Modules

```text
infra/
├── main.bicep                    # Root orchestration
├── modules/
│   ├── cosmosdb.bicep           # CosmosDB account + database + containers
│   ├── appService.bicep         # App Service Plan + Web App (backend)
│   ├── staticWebApp.bicep       # Static Web App (frontend)
│   ├── keyVault.bicep           # Key Vault for secrets
│   ├── appInsights.bicep        # Application Insights
│   └── monitor.bicep            # Log Analytics + alerts
├── parameters/
│   ├── dev.parameters.json
│   ├── staging.parameters.json
│   └── prod.parameters.json
└── scripts/
    ├── deploy.sh
    └── validate.sh
```

### Provisioned Resources

| Resource | Type | Purpose |
|----------|------|---------|
| `cosmos-<env>` | CosmosDB Account (Core/SQL) | conversations + messages containers |
| `appserviceplan-<env>` | App Service Plan (Linux/P1v2) | Backend hosting |
| `api-<env>` | Web App (Node.js 20) | Express API |
| `swa-<env>` | Static Web App | React SPA |
| `kv-<env>` | Key Vault | Secrets: API keys, CosmosDB keys |
| `appi-<env>` | Application Insights | Logging + telemetry |
| `log-<env>` | Log Analytics Workspace | Centralized logging |

### Deployment Flow

```bash
# 1. Validate
az bicep build --file infra/main.bicep

# 2. Deploy (dev)
az deployment group create \
  --resource-group rg-opencode-chat-dev \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.parameters.json

# 3. Post-deploy: seed CosmosDB containers
az cosmosdb sql container create ...

# 4. Set secrets in Key Vault
az keyvault secret set --name OpenCodeGoApiKey --value "..."
```

### Environment Separation

| Environment | Resource Group | Cost Tier | CI/CD Trigger |
|-------------|----------------|-----------|---------------|
| dev | `rg-opencode-chat-dev` | Free/C1 | Manual / PR preview |
| staging | `rg-opencode-chat-staging` | P1v2 | Merge to `main` |
| prod | `rg-opencode-chat-prod` | P1v2 | Tag release |

## Test Strategy

### Test Pyramid

```
      ╱╲
     ╱  ╲     E2E (Playwright) — 5 tests
    ╱────╲
   ╱  INT  ╲   Integration (Supertest) — 15 tests
  ╱────────╲
 ╱   UNIT   ╲  Unit (Jest/Vitest) — 30+ tests
╱────────────╲
```

### Test Types

| Layer | Tool | Scope | Coverage Target |
|-------|------|-------|-----------------|
| **Unit** | Jest (backend), Vitest (frontend) | Individual functions/components | 80% |
| **Integration** | Jest + Supertest | API endpoints + DB | 90% routes |
| **E2E** | Playwright | Full user flows | 5 critical paths |
| **Contract** | — | API request/response shape | All endpoints |

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, lint]
  test-unit:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, run-unit-tests]
  test-integration:
    runs-on: ubuntu-latest
    services: { cosmosdb-emulator }
    steps: [checkout, setup-node, run-integration-tests]
  test-e2e:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, build, playwright-test]
  iac-validate:
    runs-on: ubuntu-latest
    steps: [checkout, az-login, bicep-validate]
```

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push: { branches: [main] }
jobs:
  test: [lint, unit, integration, e2e]
  deploy-infra:
    needs: test
    steps: [bicep-deploy-to-staging]
  deploy-app:
    needs: deploy-infra
    steps: [deploy-backend, deploy-frontend]
  smoke-test:
    needs: deploy-app
    steps: [health-check, critical-path-e2e]
```

### Test Data Strategy

- **Unit tests**: Mock `@azure/cosmos` with Jest mocks
- **Integration tests**: Use CosmosDB Emulator (Docker) or ephemeral test containers
- **E2E tests**: Seed data via API; cleanup after each test

## Implementation Phases

### Phase 1: Setup + IaC Foundation
- プロジェクト構造作成
- フロントエンド・バックエンドの初期化
- Tailwind CSS設定
- Bicepモジュール作成（CosmosDB, App Service, Static Web App）
- CI/CDワークフロー作成（lint, unit test, Iac validate）

### Phase 2: Foundational + DB + Tests
- CosmosDBコンテナ初期化 + seed script
- OpenCode Go API接続（バックエンド）
- エラーハンドリングミドルウェア
- フロントエンドAPIクライアント
- **Unit tests**: db client, opencodeGo service, types
- **Integration tests**: health check endpoint
- **IaC**: dev環境への手動デプロイ、Key Vault設定

### Phase 3: User Story 1 (P1) — チャット + ストリーミング + Tests
- チャットUIコンポーネント + SSEストリーミング
- **Unit tests**: SSE parser, streaming hook
- **Integration tests**: POST /api/chat streaming
- **E2E tests**: Basic chat flow

### Phase 4: User Story 2 (P1) — 会話管理 + Tests
- 会話CRUD API + サイドバー
- **Integration tests**: Conversation CRUD
- **E2E tests**: Multiple conversations, persistence

### Phase 5: User Story 3 (P2) — Markdown
- react-markdown + syntax highlighting
- **Unit tests**: MarkdownRenderer, CodeBlock

### Phase 6: User Story 4 (P2) — 画像入力
- 画像アップロード + マルチモーダル
- **Integration tests**: Image upload flow
- **E2E tests**: Image + multimodal chat

### Phase 7: User Story 5 (P2) — レスポンシブ
- モバイルレイアウト + ハンバーガーメニュー
- **E2E tests**: Mobile viewport flows

### Phase 8: User Story 6 (P2) — モデル切り替え
- モデル選択UI + バックエンド統合
- **Unit tests**: Model validation
- **E2E tests**: Model switching flow

### Phase 9: IaC + Deploy + E2E + Monitoring
- Bicep: staging + prod environments
- GitHub Actions: full CI/CD pipeline
- Application Insights + Log Analytics
- 最終E2Eテスト（全クリティカルパス）
- 負荷テスト（オプション）
- セキュリティスキャン（Azure Security Center）
