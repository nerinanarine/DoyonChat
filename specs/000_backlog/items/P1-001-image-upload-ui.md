# P1-001: 画像入力（マルチモーダル）フロントエンド UI

## 概要

フロントエンドでドラッグ＆ドロップまたはファイルピッカーから画像を選択し、プレビューを確認してBase64エンコードした画像付きメッセージを送信できる。

## 受け入れ条件

1. チャット入力欄に画像アップロードボタン（画像追加アイコン）が表示される
2. 画像ファイルを選択するとプレビューが表示される
3. 画像付きメッセージを送信すると、API リクエストに `imageBase64` が含まれる
4. 5MB を超える画像はアップロード前に拒否される

## 関連仕様

- [バックログ一覧](../backlog.md)
- FR-006

## 関連ファイル

- `frontend/src/components/Chat/ChatInput.tsx`
- `frontend/src/hooks/useChat.ts`
- `frontend/src/services/chatApi.ts`

## 実装メモ

- `ChatInput.tsx`へファイルピッカー、ドラッグ＆ドロップ、プレビュー、選択解除を実装
- `ChatInput` → `useChat` → `chatApi`の送信経路で`imageBase64`をFunctionsへ渡し、ユーザーメッセージの画像を表示
- `frontend/src/utils/image.ts`で画像形式・5MB上限を検証し、必要に応じて画像をリサイズ
- 実装コミット: `0014324`
- 実装コミット`0014324`を含むmainコミット: `29d70bb`（PR #24）
- 本番デプロイ: mainコミット`29d70bb`を対象としたGitHub Actions Deploy run `32608281147`成功（2026-08-23）
- Messages protocolモデルへの新規画像送信は非対応。画像送信時はカタログ上画像対応のChat Completionsモデル（`glm-5.2` / `glm-5.1` / `deepseek-v4-flash-vision-exp`）を使用する

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-06-28 | 🔴 未対応 | 初期作成 |
| 2026-08-23 | 🟢 対応済み | 画像選択・D&D・プレビュー・Base64送信を確認し、本番デプロイ済みとして記録 |
