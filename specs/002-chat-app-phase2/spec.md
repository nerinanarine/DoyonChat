# Feature Specification: OpenCode Chat Phase 2

**Feature Branch**: `[002-chat-app-phase2]`

**Created**: 2026-06-27

**Status**: Draft

**Parent Spec**: [specs/001-chat-app/spec.md](../001-chat-app/spec.md)

## Scope

Phase 1（MVP）で実装されなかった以下の機能を追加する：

1. マルチモーダル非対応モデル警告（FR-014）
2. ストリーミング中断時の中間保存
3. 長い会話履歴の警告
4. 複数タブ間の状態同期

---

## 1. マルチモーダル非対応モデル警告（FR-014）

### 背景

Phase 1 では画像アップロード機能は実装されたが、選択中のモデルが画像入力に対応しているかの判定・警告は未実装。OpenCode Go API で提供されているモデルのうち、`glm-5.2` と `glm-5.1` のみがマルチモーダル対応である。Qwen-VL など他のプロバイダーではマルチモーダル対応の Qwen モデルが存在するが、OpenCode Go API では提供されていない。その他のモデル（Kimi、DeepSeek、Qwen、MiniMax、MiMo、Hy3）で画像付きメッセージを送信すると、API エラーまたは画像が無視される可能性がある。

### 動作仕様

**送信前警告**（画像ファイル選択直後に判定）：

1. ユーザーが画像ファイルを選択（ドラッグ＆ドロップまたはファイルピッカー）
2. `ChatInput.tsx` の `handleImageSelect` でファイル読み込み前に、現在の `activeConversation.model` を確認
3. 選択中のモデルの `supportsMultimodal === false` の場合、プレビュー領域の下に警告バナーを表示
4. 警告表示後もユーザーは画像の削除またはそのまま送信を選択可能

### UI 仕様

```
[画像プレビュー]
⚠️ 選択中のモデル「Kimi K2.6」は画像入力に対応していません。
   画像付きメッセージを送信すると、画像が無視される可能性があります。
   [画像を削除] [このまま送信]
```

- 色: `bg-amber-50 border-amber-200 text-amber-800`
- アイコン: `lucide-react` の `AlertTriangle`
- 位置: 画像プレビューの直下、テキスト入力欄の上

### 実装方針

**フロントエンド (`ChatInput.tsx`)**:

```typescript
// ChatInputProps に追加
interface ChatInputProps {
  // ...existing
  activeModel?: ModelInfo; // 現在選択中のモデル情報
}

// 画像選択時のハンドラ内
const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('画像サイズは5MB以下にしてください');
    return;
  }
  // ファイル読み込み前にモデル判定
  if (activeModel && !activeModel.supportsMultimodal) {
    setImage(file); // File オブジェクトを保持（プレビュー用）
    setMultimodalWarning(true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setImage(reader.result as string);
  reader.readAsDataURL(file);
};
```

**App.tsx → ChatInput への props 連携**:

```typescript
<ChatInput
  onSend={handleSend}
  onStop={stop}
  isStreaming={isStreaming}
  disabled={convLoading}
  activeModel={activeModel} // ← 追加
/>
```

### Acceptance Scenarios

1. **Given** 非マルチモーダルモデル（`kimi-k2.6`）が選択されている状態、**When** ユーザーが画像をアップロードする、**Then** プレビュー下に警告バナーが表示される
2. **Given** マルチモーダルモデル（`glm-5.2`）が選択されている状態、**When** ユーザーが画像をアップロードする、**Then** 警告は表示されない
3. **Given** 警告バナーが表示されている状態、**When** ユーザーが「画像を削除」をクリックする、**Then** 画像プレビューと警告が消える
4. **Given** 警告バナーが表示されている状態、**When** ユーザーが「このまま送信」をクリックする、**Then** 画像付きメッセージが送信される（バックエンドは通常通り処理）

---

## 2. ストリーミング中断時の中間保存

### 背景

Phase 1 の `useChat.ts` の `stop()` は AbortController で SSE 接続を切断し、フロントエンドの `streamingText` を破棄するのみ。生成途中のテキストは DB に保存されないため、ページリロード後に失われる。

### 動作仕様

1. ユーザーが「停止」ボタンをクリック
2. `useChat.ts` の `stop()` が呼ばれる
3. SSE 接続を切断（既存の動作）
4. **追加**: 生成途中の `assistantText`（ストリーミング中に蓄積されたテキスト）をバックエンドに送信して DB 保存
5. フロントエンドのメッセージ一覧を更新

### API 仕様

**新規エンドポイント**: `POST /api/chat/stop`

Request:
```json
{
  "conversationId": "uuid-string",
  "partialContent": "生成途中のテキスト..."
}
```

Response:
```json
{
  "id": "uuid-string",
  "conversationId": "uuid-string",
  "role": "assistant",
  "content": "生成途中のテキスト...",
  "createdAt": "2026-06-27T12:00:00Z"
}
```

### 実装方針

**フロントエンド (`useChat.ts`)**:

```typescript
const stop = useCallback(() => {
  const partialText = assistantTextRef.current; // ref で最新値を保持
  if (abortRef.current) {
    abortRef.current.abort();
    abortRef.current = null;
  }
  setIsStreaming(false);
  setStreamingText('');

  // 追加: 中間テキストがあれば保存
  if (partialText && conversationId) {
    api.savePartialMessage(conversationId, partialText)
      .then(() => loadMessages(conversationId))
      .catch(console.error);
  }
}, [conversationId, loadMessages]);
```

**バックエンド (`backend/src/routes/chat.ts` または新規ファイル)**:

```typescript
// POST /api/chat/stop
router.post('/stop', async (req, res, next) => {
  try {
    const { conversationId, partialContent } = req.body;
    if (!conversationId) {
      throw new AppError(400, 'conversationId is required');
    }
    const message = await service.addMessage({
      conversationId,
      role: 'assistant',
      content: partialContent || '(生成が中断されました)',
    });
    res.json(message);
  } catch (err) {
    next(err);
  }
});
```

### Acceptance Scenarios

1. **Given** AI が応答をストリーミング中の状態、**When** ユーザーが停止ボタンをクリックする、**Then** SSE が切断され、生成途中のテキストが DB に保存される
2. **Given** ストリーミング中断後にページをリロードした状態、**When** 会話を開く、**Then** 中断時点までの AI 応答が表示される
3. **Given** 停止ボタンをクリックしたが、まだ1文字も受信していない状態、**When** 保存が完了する、**Then** `(生成が中断されました)` と表示される

---

## 3. 長い会話履歴の警告

### 背景

OpenCode Go API には各モデルの `contextLength`（コンテキスト長）制限がある。会話が長くなると、古いメッセージが切り捨てられ、意図しない応答が返る可能性がある。MVP ではこの警告は未実装。

### 動作仕様

1. バックエンドで会話のメッセージ一覧を取得する際、推定トークン数を計算
2. 推定トークン数がモデルの `contextLength` の 80% を超えた場合、API レスポンスに `warning` フィールドを追加
3. フロントエンドは `warning` を受信した場合、チャット画面上部にバナーを表示

### 推定トークン数計算ルール

```typescript
// 簡易推定: 日本語・英語混合を考慮
function estimateTokens(text: string): number {
  // 日本語文字: 1文字 ≈ 1.5トークン
  // 英語単語: 1単語 ≈ 1.3トークン
  const jpChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
  const enWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const otherChars = text.length - jpChars - enWords;
  return Math.ceil(jpChars * 1.5 + enWords * 1.3 + otherChars * 0.5);
}
```

### API 変更

**既存エンドポイントの拡張**: `GET /api/conversations/:id/messages`

Response:
```json
{
  "messages": [...],
  "warning": {
    "type": "context_length",
    "message": "この会話はコンテキスト上限の85%を使用しています。新しい会話を開始することをお勧めします。"
  }
}
```

`warning` は閾値未満の場合 `null`。

### 実装方針

**バックエンド (`conversations.ts`)**:

```typescript
// GET /api/conversations/:id/messages
router.get('/:id/messages', async (req, res, next) => {
  try {
    const messages = await service.listMessages(req.params.id);
    const conversation = await service.getConversation(req.params.id);

    let warning = null;
    if (conversation) {
      const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
      const model = models.find((m) => m.id === conversation.model);
      const contextLimit = parseContextLength(model?.contextLength);
      if (totalTokens > contextLimit * 0.8) {
        warning = {
          type: 'context_length',
          message: `この会話はコンテキスト上限の${Math.round((totalTokens / contextLimit) * 100)}%を使用しています。新しい会話を開始することをお勧めします。`,
        };
      }
    }

    res.json({ messages, warning });
  } catch (err) {
    next(err);
  }
});
```

**フロントエンド (`useChat.ts`)**:

```typescript
// loadMessages のレスポンス処理
const data = await api.fetchConversationWithMessages(id);
setMessages(data.messages);
if (data.warning) {
  setWarning(data.warning); // AppLayout または ChatMessageList で表示
}
```

### UI 仕様

- 位置: チャットメッセージリストの上部（最初のメッセージの上）
- 色: `bg-orange-50 border-orange-200 text-orange-800`
- アイコン: `AlertTriangle`
- 閉じるボタン付き（`X` アイコン）

### Acceptance Scenarios

1. **Given** 会話の推定トークン数がコンテキスト上限の 80% を超えている状態、**When** 会話を開くまたはメッセージを送信する、**Then** 画面上部に警告バナーが表示される
2. **Given** 会話の推定トークン数がコンテキスト上限の 80% 未満の状態、**When** 会話を開く、**Then** 警告バナーは表示されない
3. **Given** 警告バナーが表示されている状態、**When** ユーザーが閉じるボタンをクリックする、**Then** バナーが非表示になる（そのセッション中のみ）

---

## 4. 複数タブ間の状態同期

### 背景

ユーザーが同一ブラウザで複数タブを開いている場合、タブAで新規会話を作成しても、タブBのサイドバーには反映されない。手動リロードが必要。

### 動作仕様

1. タブAで会話を作成・削除・モデル変更した際、`BroadcastChannel` で変更イベントを発行
2. タブBは同一チャンネルを購読し、変更を検知したら会話一覧を再取得
3. アクティブな会話が削除された場合、そのタブは空の状態に戻る

### 同期対象イベント

| イベント | 発行タイミング | 受信時の動作 |
|---------|-------------|------------|
| `conversation:created` | 新規会話作成後 | 会話一覧を再取得 |
| `conversation:deleted` | 会話削除後 | 会話一覧を再取得。削除された会話がアクティブならリセット |
| `conversation:updated` | モデル変更後 | 会話一覧を再取得 |
| `message:added` | メッセージ送信後（任意） | アクティブ会話のメッセージを再取得 |

### 実装方針

**新規フック (`frontend/src/hooks/useBroadcastSync.ts`)**:

```typescript
import { useEffect } from 'react';

const CHANNEL_NAME = 'opencode-chat-sync';

export function useBroadcastSync(
  activeConversationId: string | null,
  onSync: () => void,
  onActiveDeleted: () => void,
) {
  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = (event) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'conversation:created':
        case 'conversation:updated':
          onSync();
          break;
        case 'conversation:deleted':
          onSync();
          if (payload.id === activeConversationId) {
            onActiveDeleted();
          }
          break;
      }
    };

    return () => channel.close();
  }, [activeConversationId, onSync, onActiveDeleted]);
}

export function broadcastSync(type: string, payload?: unknown) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type, payload });
  channel.close();
}
```

**既存フックへの統合**:

```typescript
// useConversations.ts
import { broadcastSync } from './useBroadcastSync';

const create = async (title: string, model?: string) => {
  const conv = await api.createConversation(title, model);
  await load();
  broadcastSync('conversation:created', { id: conv.id });
  return conv;
};

const remove = async (id: string) => {
  await api.deleteConversation(id);
  await load();
  broadcastSync('conversation:deleted', { id });
};
```

```typescript
// App.tsx
import { useBroadcastSync } from './hooks/useBroadcastSync';

// App コンポーネント内
useBroadcastSync(
  activeConversationId,
  () => load(), // 会話一覧再取得
  () => setActiveConversationId(null), // アクティブ会話削除時
);
```

### フォールバック

`BroadcastChannel` が未対応のブラウザ（古い Safari など）では、機能は無効化し、従来通り手動リロードを要求する。検出方法:

```typescript
const isBroadcastChannelSupported = typeof BroadcastChannel !== 'undefined';
```

### Acceptance Scenarios

1. **Given** タブAとタブBで同じアプリを開いている状態、**When** タブAで新規会話を作成する、**Then** タブBのサイドバーに新規会話が自動的に追加される
2. **Given** タブAとタブBで同じアプリを開いている状態、**When** タブAで会話を削除する、**Then** タブBのサイドバーから該当会話が削除される
3. **Given** タブBで会話Xをアクティブにしている状態、**When** タブAで会話Xを削除する、**Then** タブBはアクティブ会話をリセットし、空のチャット画面を表示する
4. **Given** BroadcastChannel が未対応のブラウザで開いている状態、**When** 別タブで変更が発生しても、**Then** エラーは発生せず、手動リロードが必要なのみ

---

## 技術的制約

- **BroadcastChannel**: 同一オリジン（同一ドメン・ポート・プロトコル）のタブ間のみ通信可能。Azure デプロイ後も同様。
- **推定トークン数**: 正確なトークン数はモデル依存（BPE等）であり、簡易推定では誤差がある。警告はあくまで目安として扱う。
- **ストリーミング中断保存**: 停止ボタン連打時の重複保存を防ぐため、保存中フラグを設ける。

## 実装優先順位

| 順位 | 機能 | 理由 |
|-----|------|------|
| 1 | マルチモーダル非対応モデル警告 | ユーザビリティに直結。実装が軽微 |
| 2 | ストリーミング中断時の中間保存 | データ損失防止。既存フックの拡張のみ |
| 3 | 複数タブ間の状態同期 | 利便性向上。新規フックの追加 |
| 4 | 長い会話履歴の警告 | 推定精度の課題あり。最も複雑 |

## 関連ファイル

- `frontend/src/components/Chat/ChatInput.tsx`
- `frontend/src/hooks/useChat.ts`
- `frontend/src/hooks/useConversations.ts`
- `frontend/src/App.tsx`
- `backend/src/routes/chat.ts`
- `backend/src/routes/conversations.ts`
- `backend/src/services/conversationService.ts`
- `backend/src/routes/models.ts`
