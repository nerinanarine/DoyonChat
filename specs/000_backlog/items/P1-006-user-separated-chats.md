# P1-006: ユーザーごとにチャットを分ける

## 概要

Entra ID 認証後、ユーザーごとに会話とメッセージへのアクセスを分離する。ユーザー A の会話はユーザー B から一覧表示・閲覧・変更・削除できないようにする。

本項目は P2-006（Azure Functions 移行）と同一リリースで実装する。Express バックエンドと Functions バックエンドの両方で、同じ所有権ルールを適用する。

## 受け入れ条件

1. ユーザー A が作成した会話は、ユーザー A の会話一覧にだけ表示される
2. ユーザー B はユーザー A の会話に対する以下の操作ができない
   - 会話詳細の取得
   - メッセージ一覧の取得
   - メッセージ送信
   - モデル変更
   - 会話削除
3. 他ユーザーの会話 ID を直接指定した場合は `404 Not Found` を返し、会話の存在を漏らさない
4. ログアウト後に別ユーザーでログインすると、前ユーザーの会話が表示されない
5. 認証有効時、会話 API とチャット API に有効な Bearer Token がない場合は `401` を返す
6. `AUTH_ENABLED=false` のローカル開発時は、従来どおり匿名ユーザーとして会話を共有できる
7. Express バックエンドと Azure Functions の両方で同じ所有権チェックが動作する
8. 既存の会話・メッセージデータを削除せずに実装できる

## データモデル

### Conversation

新規作成する会話には `userId` を必ず設定する。

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

TypeScript では、既存の匿名データを扱うため `userId` は読み取り時に任意として扱えるようにする。ただし、新規作成時の `userId` 欠落は許可しない。

### Message

`Message` は引き続き `conversationId` で会話に関連付ける。メッセージ自体に `userId` は追加しない。会話の所有権を確認した後にのみメッセージへアクセスする。

## 既存匿名データの扱い

既存の `userId` なし会話は削除しない。また、今回のリリースでは特定の Entra ID ユーザーへ自動移管しない。

- `AUTH_ENABLED=true`:
  - `userId` がない会話は通常ユーザーの一覧・詳細・チャット操作から除外する
  - 既存データは Cosmos DB に保持するが、一般ユーザーには表示しない
- `AUTH_ENABLED=false`:
  - `userId` の有無にかかわらず、従来どおり会話を共有する
  - 新しく作成する会話には `dev-user` を設定する

## Cosmos DB パーティション戦略

現在のパーティションキーを維持する。

- `conversations`: `/id`
- `messages`: `/conversationId`

`/userId` への変更はコンテナー再作成とデータ移行を伴うため、P1-006/P2-006の範囲では行わない。ユーザー別一覧取得は `userId` 条件付きクエリで実装する。

## API 仕様

以下の API は、認証ユーザーの `userId` を必ずスコープとして扱う。

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id`
- `DELETE /api/conversations/:id`
- `PUT /api/conversations/:id/model`
- `GET /api/conversations/:id/messages`
- `POST /api/chat`

### 新規作成

クライアントから送信された `userId` は使用せず、認証ミドルウェアが設定した `req.userId` または Functions の認証コンテキストから取得する。

```typescript
const conversation = await service.createConversation({
  title,
  model,
  userId: authenticatedUserId,
});
```

### 所有権確認

会話 ID を受け取るすべての API は、処理前に以下を確認する。

1. 会話が存在する
2. `AUTH_ENABLED=false` または匿名開発モードである
3. 認証有効時は `conversation.userId === authenticatedUserId`

条件を満たさない場合は `404 Not Found` を返す。

## 実装対象ファイル

### Express バックエンド

- `backend/src/types/index.ts`
- `backend/src/services/conversationService.ts`
- `backend/src/routes/conversations.ts`
- `backend/src/routes/chat.ts`
- `backend/tests/unit/`
- `backend/tests/integration/`

### Azure Functions

P2-006 の Functions 実装にも同じサービス・所有権ルールを適用する。

- `functions/src/services/conversationService.ts`
- `functions/src/functions/conversations.ts`
- `functions/src/functions/messages.ts`
- `functions/src/functions/chat.ts`
- `functions/tests/`

## テスト方針

### 単体テスト

- 新規会話に認証済みユーザーの `userId` が保存される
- リクエスト本文の `userId` が無視される
- 別ユーザーの会話が取得できない
- 別ユーザーの会話へチャット送信できない
- 別ユーザーの会話を削除・モデル変更できない
- `AUTH_ENABLED=false` では従来どおり共有できる
- `userId` なしの旧データが認証有効時に表示されない

### 統合テスト

- ユーザー A で作成した会話がユーザー B の一覧に出ない
- ユーザー B が ID を直接指定しても 404
- ログアウト後の別ユーザーで以前の会話が取得できない
- Express と Functions の API で同じ結果になる

## 依存関係

- **前提:** P1-005 Entra ID 認証
- **同時実装:** P2-006 Azure Functions 移行
- **本番切替条件:** P1-006 の所有権チェックと Functions 移行の両方が完了していること

## 注意点

- 旧匿名データは削除しないが、認証有効時には一般ユーザーへ公開しない
- Cosmos DB の既存コンテナーを再作成しない
- `userId` をクライアントから受け取って信頼しない
- Functions と Express で所有権判定が分岐しないようにする

## 実装メモ

- Entra ID JWTの`oid`をConversationの`userId`として保存
- ExpressとFunctionsの会話一覧・詳細・メッセージ・チャット・モデル変更・削除に所有権チェックを適用
- 他ユーザーまたは旧匿名データへのアクセスは404
- `AUTH_ENABLED=false`では`dev-user`の共有モードを維持
- 旧匿名データは削除せず、認証有効時は一般ユーザーから非表示
- Cosmos DBのパーティションキー（`/id`、`/conversationId`）は変更なし
- 関連実装コミット: `e7d3a5b`, `9bb222d`
- 本番Functionsでユーザー分離を確認済み

**注意:** staging環境は未作成のため、staging専用の実トークン検証は別途実施する。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| — | 🟡 仕様確定 | P2-006 と同時実装。旧匿名データは保持し、認証有効時は非表示。Cosmos DB の `/id` パーティションキーを維持 |
| — | 🟢 対応済み | Express/Functions実装、ユーザー分離テスト、本番切替を完了 |
