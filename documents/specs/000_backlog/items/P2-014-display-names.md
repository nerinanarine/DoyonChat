# P2-014: チャット画面の発言者名をカスタマイズ

## 概要

チャット画面における発言者名の表示を改善する。

- **AI側**: 現在「AI」と表示されている部分を、選択中のモデル名（例：「GPT-4o」「Claude 3.5 Sonnet」）に変更する
- **ユーザー側**: 設定メニューにユーザー名の登録機能を追加し、「あなた」の代わりに登録されたユーザー名を表示する

## 背景

- 現状、AIの回答は「AI」として表示され、ユーザーの質問は「あなた」として表示される
- モデルを切り替えても表示名が変わらないため、どのモデルに質問しているか分かりにくい
- ユーザーが複数人で同じ画面を見る場合に「あなた」では誰の質問か不明

## 受け入れ条件

1. AIのメッセージには、そのメッセージの生成に使用されたモデルの表示名が表示される
   - モデルを会話途中で切り替えた場合、各メッセージにはその時点のモデル名が表示される
2. ユーザーのメッセージには、設定で登録されたユーザー名が表示される
   - ユーザー名が未設定の場合は「あなた」をフォールバック表示する
3. 設定メニューにユーザー名の入力欄が追加される
4. ユーザー名はサーバーに保存され、別デバイスでも反映される（P2-008の設定機能を活用）
5. モデル名は、モデル一覧のユーザー向け表示名を利用する
6. 既存のメッセージ表示（Reasoning、Markdown、ストリーミング等）を壊さない

## エッジケース

- **モデル名がモデル一覧に存在しない**: 保存されたモデルIDをフォールバック表示する
- **ユーザー名が空文字**: 「あなた」を表示する
- **ユーザー名が長すぎる**: 表示上は切り詰める（上限はSpec/Planで確定）
- **過去データ**: メッセージにmodelフィールドがない場合、会話の現在選択モデルをフォールバックとして使用する

## 技術的実装方針（案）

### データモデル

**ユーザー設定（P2-008拡張）:**
```json
{
  "userId": "entra-object-id",
  "settings": {
    "defaultModel": "kimi-k2.6",
    "displayName": "田中太郎"
  }
}
```

**メッセージ（P2-010と連携）:**
```json
{
  "role": "assistant",
  "content": "回答本文",
  "model": "gpt-4o"
}
```

### 表示ロジック

```
AIメッセージ: models.find(m => m.id === message.model)?.displayName || message.model || "AI"
ユーザーメッセージ: settings.displayName || "あなた"
```

## 関連ファイル（想定）

- `frontend/src/components/Chat/ChatMessage.tsx`（発言者名の表示変更）
- `frontend/src/components/Settings/SettingsMenu.tsx`（ユーザー名入力欄追加）
- `frontend/src/hooks/useSettings.ts`（displayName設定の追加）
- `functions/src/functions/users.ts`（設定API拡張）
- `functions/src/services/userSettingsService.ts`（設定保存拡張）

## Out of Scope

- メッセージ単位のモデル名・生成時間表示（P2-010で対応）
- ユーザーアイコン・アバターの追加
- チャット画面のレイアウト変更

## 依存関係

- **ブロックする:** なし
- **ブロックされる:** P2-008（ユーザー設定機能）— ユーザー名保存に必要
- **関連:** P2-010（モデル名・生成時間表示）— メッセージへのmodel保存を共有

## 実装メモ

- Backend: `functions/src/types/index.ts`（UserSettingsにdisplayName追加）、`services/userSettingsService.ts`（displayName保存・サニタイズ）、`functions/users.ts`（50文字上限バリデーション）
- Frontend: `types/index.ts`（UserSettingsにdisplayName、Messageにmodel追加）、`hooks/useSettings.ts`（displayName更新対応）、`components/Settings/SettingsMenu.tsx`（表示名入力欄追加、Enter/blurで保存）、`components/Chat/ChatMessage.tsx`（モデル名/ユーザー名表示）、`components/Chat/ChatMessageList.tsx`（ストリーミング中のモデル名表示）、`App.tsx`（currentModel/settings伝播）
- テスト: frontend 99 pass、backend 146 pass
- コミット: `c7b9973` feat(P2-014)

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-02 | 🔴 未対応 | 初期作成 |
| 2026-09-02 | 🟢 対応済み | 実装・テスト完了、コミット `c7b9973` |
