# Data Model: OpenCode Go Chat Web App

## CosmosDB Container Design

### Database: `chatdb`

### Container: `conversations`
- **Partition key**: `/id`
- **Documents**: JSON

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
- **Partition key**: `/conversationId`
- **Documents**: JSON

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

## Entities

### Conversation

| Attribute | Type | Description |
|-----------|------|-------------|
| id | string | 一意識別子（UUID）。パーティションキー |
| title | string | 会話タイトル |
| model | string | 使用するAIモデルID（デフォルト: kimi-k2.6） |
| createdAt | string (ISO 8601) | 作成日時 |
| updatedAt | string (ISO 8601) | 更新日時 |

### Message

| Attribute | Type | Description |
|-----------|------|-------------|
| id | string | 一意識別子（UUID） |
| conversationId | string | 所属会話のID。パーティションキー |
| role | string | メッセージ送信者 (`user` / `assistant`) |
| content | string | メッセージ本文 |
| imageUrl | string (optional) | Base64画像データ（マルチモーダル時） |
| createdAt | string (ISO 8601) | 作成日時 |

## @azure/cosmos SDK Usage

```typescript
// backend/src/db/index.ts
import { CosmosClient } from '@azure/cosmos';

const client = new CosmosClient({
  endpoint: process.env.COSMOSDB_ENDPOINT!,
  key: process.env.COSMOSDB_KEY!,
});

const database = client.database(process.env.COSMOSDB_DATABASE!);
export const conversationsContainer = database.container('conversations');
export const messagesContainer = database.container('messages');
```

## Container Initialization Script

```typescript
// backend/src/db/init.ts
import { CosmosClient } from '@azure/cosmos';

const client = new CosmosClient({
  endpoint: process.env.COSMOSDB_ENDPOINT!,
  key: process.env.COSMOSDB_KEY!,
});

async function init() {
  const { database } = await client.databases.createIfNotExists({ id: 'chatdb' });
  await database.containers.createIfNotExists({
    id: 'conversations',
    partitionKey: { paths: ['/id'] },
  });
  await database.containers.createIfNotExists({
    id: 'messages',
    partitionKey: { paths: ['/conversationId'] },
  });
}

init().catch(console.error);
```

## TypeScript Interfaces

```typescript
// backend/src/types/index.ts
export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  quality: number;
  speed: string;
  cost: string;
  supportsMultimodal: boolean;
  contextLength: string;
  bestFor: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  createdAt: string;
}

export interface ChatRequest {
  conversationId: string;
  message: string;
  imageBase64?: string;
}

export interface OpenCodeGoMessage {
  role: 'user' | 'assistant';
  content: string | OpenCodeGoContentPart[];
}

export interface OpenCodeGoContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}
```

## Data Flow

1. ユーザーが新規チャットを作成 → `conversations` コンテナにドキュメント作成
2. ユーザーがメッセージを送信 → `messages` コンテナにドキュメント作成（role='user'）
3. バックエンドがOpenCode Go APIを呼び出し
4. AI応答を受信 → `messages` コンテナにドキュメント作成（role='assistant'）
5. ストリーミング中はフロントエンドに逐次送信、DBには最終テキストを保存

## Query Examples

```typescript
// 会話一覧取得（更新日時降順）
const { resources: conversations } = await conversationsContainer.items
  .query({ query: 'SELECT * FROM c ORDER BY c.updatedAt DESC' })
  .fetchAll();

// 特定会話のメッセージ一覧取得（単一パーティションクエリ）
const { resources: messages } = await messagesContainer.items
  .query({
    query: 'SELECT * FROM c WHERE c.conversationId = @conversationId ORDER BY c.createdAt ASC',
    parameters: [{ name: '@conversationId', value: conversationId }],
  }, { partitionKey: conversationId })
  .fetchAll();

// 会話削除（関連メッセージもアプリケーション層で削除）
await conversationsContainer.item(conversationId, conversationId).delete();
const { resources: messagesToDelete } = await messagesContainer.items
  .query({
    query: 'SELECT c.id FROM c WHERE c.conversationId = @conversationId',
    parameters: [{ name: '@conversationId', value: conversationId }],
  }, { partitionKey: conversationId })
  .fetchAll();
for (const msg of messagesToDelete) {
  await messagesContainer.item(msg.id, conversationId).delete();
}
```
