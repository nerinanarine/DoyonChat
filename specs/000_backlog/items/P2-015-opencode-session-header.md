# P2-015: x-opencode-session・遅延作成・モデル1件追加

## 概要

OpenCode Go からの通知に対応し、backend → OpenCode Go の上流リクエストに `x-opencode-session: <会話ごとの安定ID>` を付与する。安定IDには CosmosDB の `conversation.id`（新規チャット作成時に払い出される UUID）を使う。通知によれば 09/06 以降、ヘッダなしリクエストはエラーになる可能性がある。

あわせて、新規チャット作成を遅延化する。現状はボタン押下時に `POST /conversations` で空会話が作られ、未送信のまま離れるとゴミが残る。ボタン押下では選択解除のみ行い、初回送信時に初めて会話を作成する（送信前の選択モデルはローカルに保持し、作成時に渡す）。

さらに、公式Endpoints表（27件）に追従し `muse-spark-1.3-contributor`（`/v1/responses`）をカタログへ追加する。現行26件との差分は本件のみ。

## Feature specification

- [仕様](../../P2-015/spec.md)
- [実装計画](../../P2-015/plan.md)

## 受け入れ条件

1. チャット送信（`POST /api/chat` → 上流3プロトコル `responses` / `chat/completions` / `messages`）の全リクエストに、対象会話の ID と同一の `x-opencode-session` が付与される
2. タイトル自動生成（`POST /api/conversations/{id}/title/auto`）の上流リクエストにも、同一会話 ID が付与される
3. 同じ会話の複数メッセージ送信でヘッダ値が不変である（会話ごとに安定）
4. 既存の frontend / functions テストとビルドが成功し、新規テストでヘッダ付与が固定される
5. API キー・リクエスト本文・回答本文・上流エラー本文をログへ出力しない（既存方針を維持）
6. 新規チャットボタン押下のみでは `POST /conversations` が呼ばれず、一覧に仮行も追加されない
7. 未選択状態からの初回送信で会話が作成され、送信前に選んだモデルで作成・送信される
8. 未送信ドラフトはリロード・会話切替で破棄され、空会話が残らない
9. `GET /api/models` が公式Endpoints表の27モデルを重複なく返し、`muse-spark-1.3-contributor` が `responses` で送信される
10. live test で27モデルすべての実APIチャットが成功する

## スコープ境界

- 本項目は上流 `fetch` へのヘッダ付与と、会話 ID の受け渡し（`chat.ts` / `conversations.ts` → `opencodeGo.ts`）のみを担当する
- 会話に紐付かない `healthCheck()` の `ping` の扱い（付与しない／固定値）は Spec/Plan で確定する
- モデルカタログ・プロトコル選択・SSE 正規化の変更は行わない（P2-011 の範囲）
- 本項目はあわせて新規チャット作成の遅延化（frontend `App.tsx` 中心、DB 作成は初回送信時）を担当する
- 本項目はあわせて `muse-spark-1.3-contributor` 1件のカタログ追加（protocol・件数テスト・README・`specs/009` 正規表・live test 27件化）を担当する。P2-011 の範囲と重なるため、P2-011 項目へ参照を追記する

## 関連ファイル（想定）

- `functions/src/services/opencodeGo.ts`
- `functions/src/functions/chat.ts`
- `functions/src/functions/conversations.ts`
- `functions/tests/`
- `frontend/src/App.tsx`
- `frontend/tests/unit/`
- `functions/src/config/modelCatalog.ts`
- `functions/live-tests/`
- `README.md`
- `specs/009-opencode-go-models/spec.md`

## 実装メモ

- （未実施）

---

## 変更履歴

| 日付 | ステータス | 備考 |
|------|-----------|------|
| 2026-09-03 | 🔴 未対応 | 初期作成。OpenCode Go からのヘッダ不足通知への対応 |
| 2026-09-03 | 🔴 未対応 | B案として新規チャット遅延作成をスコープ追加（選択肢1: 一覧に出さず選択解除のみ、モデルはローカル保持、ドラフトは破棄可） |
| 2026-09-03 | 🔴 未対応 | A案としてモデル1件追加（`muse-spark-1.3-contributor`、`responses`）をスコープ追加。公式27件との差分は本件のみ |
