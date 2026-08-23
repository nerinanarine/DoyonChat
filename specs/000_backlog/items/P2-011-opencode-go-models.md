# P2-011: OpenCode Goモデルカタログ更新・全モデル実API疎通

## 概要

OpenCode Go公式Endpoints表を正として、DoyonChatで選択・チャットできるモデルを23件へ更新する。モデルごとにResponses、Chat Completions、Messagesの3プロトコルを正しく使い分け、全23モデルで実APIへのテキストチャット疎通を確認する。

## Feature specification

- [仕様](../../009-opencode-go-models/spec.md)
- [実装計画](../../009-opencode-go-models/plan.md)
- [OpenCode Go公式Endpoints表](https://dev.opencode.ai/docs/go/)

## 受け入れ条件

1. `GET /api/models`が公式Endpoints表の23モデルだけを返す
2. Responses 3件、Chat Completions 13件、Messages 7件が正しい上流APIへ送信される
3. Frontendで23モデルを会話単位に選択・保存・復元できる
4. 3プロトコルのストリーム本文とReasoningを既存UIへ正規化できる
5. 利用不可モデルを保持する既存会話は履歴を閲覧できるが、現行モデルを再選択するまで送信できない
6. 通常テスト・CIから分離した明示実行のlive testで、23モデルすべての実APIチャットが成功する
7. APIキー、リクエスト本文、回答本文、上流エラー本文をlive testログへ出力しない

## スコープ境界

- 本項目はモデルカタログ、3プロトコル対応、モデル検証、利用不可モデルの安全な扱い、全23モデルの実API疎通を担当する
- P3-007はカバレッジ80%や各フック・serviceの網羅的unit testなど、プロジェクト全体のテスト強化を引き続き担当する
- P3-007の全LLM実API疎通条件は、本項目の実API確認完了後にP2-011で実施済みとして参照を追記する

## 関連ファイル（想定）

- `functions/src/config/modelCatalog.ts`
- `functions/src/functions/models.ts`
- `functions/src/functions/conversations.ts`
- `functions/src/functions/chat.ts`
- `functions/src/services/opencodeGo.ts`
- `functions/tests/`
- `functions/live-tests/`
- `frontend/src/components/Layout/AppLayout.tsx`
- `frontend/src/components/Chat/ChatInput.tsx`
- `frontend/tests/unit/`
- `README.md`
- `specs/001-chat-app/spec.md`
- `specs/001-chat-app/plan.md`

## 実装メモ

- 正規23モデルをFunctionsの単一カタログへ集約し、Responses 3件、Chat Completions 13件、Messages 7件をprotocol別に実装
- 会話作成・モデル変更・chat送信前のmodel検証と、Frontendのloading / error / 利用不可状態を実装
- 通常テスト・CIから分離した`npm run test:live:models`を追加
- 2026-08-23に全23モデルで空でない本文と正常完了を同一runで確認（23/23成功）
- live test条件: 直列、各1リクエスト、retryなし、512 tokens上限、120秒timeout
- Kimi K3は公式モデル定義に従い、非対応の`temperature`をrequestから除外
- APIキー、request / response本文、上流error bodyはログ・Git管理ファイルへ出力していない
- マージコミット: 未マージ

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-08-22 | 🟡 進行中 | 公式Endpoints表23モデルを対象にSpec/Plan作成開始 |
| 2026-08-23 | 🟡 進行中 | 実装・通常テスト・全23モデル実API疎通を完了。マージ待ち |
