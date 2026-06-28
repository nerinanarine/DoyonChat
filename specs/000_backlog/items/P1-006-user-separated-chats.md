# P1-006: ユーザーごとにチャットを分ける

## 概要

認証導入後、各ユーザーの会話・メッセージを分離する。ユーザー A の会話はユーザー B から見えないようにし、データモデル・API・フロントエンドすべてに `userId` を導入する。

## 背景

- MVP ではすべての会話が共有（匿名ユーザー用の単一プール）
- 本番運用では、ユーザーごとにプライベートな会話空間が必要
- CosmosDB のパーティション戦略も見直しが必要になる可能性がある

## 受け入れ条件

1. ユーザー A が作成した会話は、ユーザー A のサイドバーにのみ表示される
2. ユーザー B はユーザー A の会話を閲覧・操作できない（404 または 403 を返す）
3. ログアウト後に別ユーザーでログインすると、前ユーザーの会話が表示されない
4. 未認証状態で会話 API にアクセスすると 401 が返される
5. 既存の匿名モード（`AUTH_ENABLED=false`）では、従来通りすべての会話が共有される

## データモデル変更

### Conversation（追加フィールド）

```json
{
  "id": "uuid-string",
  "userId": "entra-object-id-string",
  "title": "New Chat",
  "model": "kimi-k2.6",
  "createdAt": "2026-06-28T10:00:00Z",
  "updatedAt": "2026-06-28T10:00:00Z"
}
```

### Message（変更なし）

`Message` は `conversationId` で関連付けられているため、直接の `userId` は不要。`conversationId` → `Conversation.userId` で間接的に所有関係を判定する。

### CosmosDB パーティション戦略

現在のパーティションキー:
- `conversations`: `/id`
- `messages`: `/conversationId`

変更案:
- `conversations`: `/userId` に変更することで、特定ユーザーの会話一覧取得が単一パーティションクエリになり効率化される
- ただし、既存データのマイグレーションが必要

## API 変更

### 認証ミドルウェアからの `userId` 受け取り

```typescript
// req.userId は P1-005 の auth ミドルウェアで設定
router.get('/api/conversations', async (req, res) => {
  const conversations = await service.listConversationsByUser(req.userId);
  res.json(conversations);
});

router.get('/api/conversations/:id', async (req, res) => {
  const conversation = await service.getConversation(req.params.id);
  if (conversation.userId !== req.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(conversation);
});
```

### 新規作成時

```typescript
router.post('/api/conversations', async (req, res) => {
  const conversation = await service.createConversation({
    ...req.body,
    userId: req.userId, // auth ミドルウェアから取得
  });
  res.json(conversation);
});
```

## フロントエンド変更

- `useConversations.ts` の変更は不要（API レスポンスがユーザー絞り込み済みになるため）
- ただし、401 エラー時のハンドリング（ログイン画面リダイレクト）は必要

## 関連ファイル

- `backend/src/services/conversationService.ts`（userId フィルタ追加）
- `backend/src/routes/conversations.ts`（所有権チェック追加）
- `backend/src/routes/chat.ts`（所有権チェック追加）
- `backend/src/types/index.ts`（Conversation 型に userId 追加）
- `specs/001-chat-app/data-model.md`（データモデル更新）

## 依存関係

- **ブロックする:** なし
- **ブロックされる:** P1-005（Entra ID 認証）— 認証なしでは userId を特定できない

## 注意点

- **データマイグレーション**: 既存の匿名会話はどう扱うか？
  - 案 A: 既存会話をすべて削除（開発環境のみ）
  - 案 B: 既存会話にダミー `userId` を付与し、管理者用ビューで閲覧可能にする
  - 案 C: 本番環境ではまだデータがないので問題なし（推奨）
- **インデックス**: `conversations` コンテナに `userId` のインデックスを追加する必要がある

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
