# P1-007: Reasoning モデルの Thinking コンテンツをわかりやすく表示

## 概要

現在、GLM-5.x・DeepSeek・Qwen・Kimi・MiMo・Hy3 などの Reasoning 対応モデルは、思考プロセス（`reasoning_content` / `reasoning`）と最終回答（`content`）を両方返す。しかしフロントエンドでは両方が同じテキストブロックとして連結表示されており、思考部分と回答部分の区別がつかず、非常に見にくい。

## 現状の問題

**API レスポンス例（GLM-5.1）:**
```json
{
  "choices": [{
    "delta": {
      "reasoning_content": "まず、この質問は...",
      "content": "結論として..."
    }
  }]
}
```

**現在の表示:**
```
まず、この質問は...結論として...
```
→ 思考と回答が混在して読みにくい

## 受け入れ条件

1. **思考プロセス**と**最終回答**が視覚的に区別されて表示される
2. 思考部分はデフォルトで折りたたまれており、クリックで展開できる
3. 折りたたみ時は「🤔 思考プロセス（N文字）」といったラベルだけ表示される
4. モデルが Reasoning コンテンツを返さない場合（非対応モデルや通常回答時）は、従来通りの表示になる
5. ストリーミング中も、思考部分と回答部分がリアルタイムに分離表示される

## UI 仕様

### 折りたたみ表示（デフォルト）

```
┌─────────────────────────────────────┐
│ 🤔 思考プロセス（展開する）            │  ← クリックで展開
├─────────────────────────────────────┤
│ 結論として、〜〜〜                    │  ← 最終回答（常に表示）
└─────────────────────────────────────┘
```

### 展開時

```
┌─────────────────────────────────────┐
│ 🤔 思考プロセス                       │
│ ─────────────────────────────────── │
│ まず、この質問は...                   │
│ 次に、〜〜〜                         │
├─────────────────────────────────────┤
│ 結論として、〜〜〜                    │
└─────────────────────────────────────┘
```

- 思考部分の背景色: `bg-slate-50`（ライト） / `bg-slate-900`（ダーク対応時）
- 思考部分の文字色: `text-slate-600`（ライト）
- 思考部分のボーダー: `border-l-2 border-slate-300 pl-3`
- アイコン: `lucide-react` の `Brain` または `Sparkles`

## 技術的実装方針

### 1. バックエンド側の SSE レスポンス変更

`backend/src/services/opencodeGo.ts` の `parseSSELine` で、既に `reasoning_content` と `content` を別々に抽出している。SSE イベントの種別を付与して送信する：

```typescript
// 現在
event: message
data: {"type":"content","text":"..."}

// 変更後
event: message
data: {"type":"reasoning","text":"思考プロセスの一部..."}

event: message
data: {"type":"content","text":"最終回答の一部..."}
```

または、同一イベント内に両方を含める：

```typescript
data: {"reasoning":"思考...","content":"回答..."}
```

### 2. フロントエンド側の状態管理

`frontend/src/hooks/useChat.ts` で、ストリーミングテキストを2つの状態に分離：

```typescript
const [streamingReasoning, setStreamingReasoning] = useState('');
const [streamingContent, setStreamingContent] = useState('');
```

SSE パース時に `type` フィールドを見て、適切な状態に蓄積する。

### 3. フロントエンド側の表示コンポーネント

`frontend/src/components/Chat/ChatMessage.tsx` を拡張：

```typescript
interface ChatMessageProps {
  message: Message;
  reasoning?: string;  // 追加
  isStreaming?: boolean;
}
```

AI メッセージ（`role === 'assistant'`）で `reasoning` が存在する場合：
1. `CollapsibleReasoning` コンポーネントで思考部分をラップ
2. 最終回答は通常の `MarkdownRenderer` で表示

### 4. DB 保存形式

`messages` コンテナに `reasoning` フィールドを追加（オプション）：

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "role": "assistant",
  "content": "最終回答",
  "reasoning": "思考プロセス全文",
  "createdAt": "..."
}
```

既存データには `reasoning` がないため、後方互換性を維持する。

## 関連ファイル

- `backend/src/services/opencodeGo.ts`（SSE パース、reasoning/content 分離）
- `backend/src/routes/chat.ts`（SSE イベント形式変更）
- `frontend/src/hooks/useChat.ts`（ストリーミング状態分離）
- `frontend/src/components/Chat/ChatMessage.tsx`（UI 表示変更）
- `frontend/src/components/Chat/CollapsibleReasoning.tsx`（新規）
- `backend/src/types/index.ts`（Message 型に reasoning 追加）

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
