# P2-008: ユーザーごとに設定を保存できる機能

## 概要

認証導入後、各ユーザーごとにアプリ設定（既定モデルなど）を永続化する。Azure Functions + Cosmos DB のユーザープロファイルと連携させ、別デバイスでも設定を復元できるようにする。

## 背景

- 現状は既定モデル選択などのユーザー固有設定が存在せず、会話ごとに再選択が必要
- 認証導入済み（Entra ID 必必須）のため、ユーザーアカウントに紐づけて設定を保持できる

## 受け入れ条件

1. ユーザーがログイン後、前回の設定（既定モデルなど）が復元される
2. 設定変更は即座にサーバーに保存され、別デバイスでも反映される
3. 設定項目は拡張可能な構造とする（新しい設定が追加されても対応できる）
4. ログアウトボタンが画面上の設定メニュー内に配置される
5. 未認証時の localStorage フォールバックは対象外（本番は常に認証必須のため。2026-08-23 変更）

## 設定項目（初期）

| 設定キー | 型 | 説明 |
|---------|-----|------|
| `defaultModel` | string | 新規会話時の既定モデル（null で解除） |

※ テーマ（ライト/ダーク/システム）は対象外（2026-08-23 変更）。構造は拡張可能。

## データモデル

```json
{
  "id": "uuid-string",
  "userId": "entra-object-id-string",
  "settings": {
    "defaultModel": "kimi-k2.6",
    "theme": "system"
  },
  "updatedAt": "2026-06-28T10:00:00Z"
}
```

## API 想定

```typescript
// 設定取得
GET /api/users/me/settings

// 設定更新（部分更新）
PATCH /api/users/me/settings
```

## 関連ファイル

- `frontend/src/hooks/useSettings.ts`（新規）
- `functions/src/services/userSettingsService.ts`（新規）
- `functions/src/functions/users.ts`（新規）
- `infra/modules/cosmosdb.bicep`（userSettings コンテナ追加）

## 依存関係

- **ブロックする:** なし
- **ブロックされる:** P1-005（Entra ID 認証）— 認証なしでは userId を特定できない

## 実装メモ

> 対応後にここに実装内容・マージコミット・注意点を記載してください。

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-07-05 | 🔴 未対応 | 初期作成
| 2026-08-23 | 🟡 進行中 | specs/P2-008/spec.md・plan.md 作成（レビュー反映済み）。ブランチ feat/008-user-settings。テーマ/localStorage フォールバックを対象外に変更 |
