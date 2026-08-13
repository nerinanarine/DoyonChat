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

`functions/src/services/opencodeGo.ts` と `functions/src/services/reasoningNormalizer.ts` で、OpenCode Goのプロトコル・フィールド差異を正規化する。`reasoning_content`、`reasoning`、その他の登録済みフィールド、Responses APIイベント、`<think>`系マーカーをReasoningとして抽出し、既存の`content`と`done`を維持したSSEへ変換する：

```text
data: {"content":"","reasoning":"思考プロセスの一部...","done":false}

data: {"content":"最終回答の一部...","done":false}

data: {"content":"","done":true}
```

### 2. フロントエンド側の状態管理

`frontend/src/hooks/useChat.ts` で、ストリーミングテキストを2つの状態に分離：

```typescript
const [streamingReasoning, setStreamingReasoning] = useState('');
const [streamingContent, setStreamingContent] = useState('');
```

SSE パース時に`content`と任意の`reasoning`フィールドを読み取り、適切な状態に蓄積する。

### 3. フロントエンド側の表示コンポーネント

`frontend/src/components/Chat/ChatMessage.tsx` を拡張：

```typescript
interface ChatMessageProps {
  message: Message;
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

- `functions/src/services/opencodeGo.ts`（OpenCode Go SSE読み取り）
- `functions/src/services/reasoningNormalizer.ts`（Reasoning形式の正規化）
- `functions/src/functions/chat.ts`（下流SSE・Message保存）
- `functions/src/types/index.ts`（Message型にreasoning追加）
- `frontend/src/services/chatApi.ts`（Reasoning付きSSE解析）
- `frontend/src/hooks/useChat.ts`（ストリーミング状態分離）
- `frontend/src/components/Chat/ChatMessage.tsx`（UI表示変更）
- `frontend/src/components/Chat/CollapsibleReasoning.tsx`（新規）

## 実装メモ

- Functions側にReasoning正規化層を追加し、Chat Completions、Responses API、`<think>`系マーカーを処理する
- SSEは既存の`content` / `done`形式を維持し、任意の`reasoning`フィールドを追加した
- assistant MessageへReasoning全文を保存し、次回のOpenCode Goリクエストには再送しない
- FrontendにReasoningのストリーミング分離と折りたたみ表示を追加した
- 旧Expressバックエンドと関連する現行CI・セットアップ手順を削除した
- 実装ブランチ: `feat/007-reasoning-display`
- PR番号・マージコミット: 未作成（本番デプロイ前）

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-08-13 | 🟡 進行中 | Spec/Plan確定、実装開始 |
