# P4-001: ローカル確認環境 (UIリファクタリングの前段)

> 対応backlog: `documents/specs/000_backlog/items/P4-001-ui-refactoring.md` (UIリファクタリング本体)。本specはその前段となるローカル確認環境のみを対象とし、UI改修本体は含まない。

## 目的

UI改修に着手する前段として、ローカル環境でアプリのUIをブラウザから確認できる状態にする。

## 対象範囲

- frontend (`:5173`)
- functions (`:7071`)
- gateway (`:8787`)
- Azurite
- 各サービス間のローカル疎通と、ブラウザでのUI表示確認

## 対象外

- 本番環境へのデプロイ
- UI改修そのもの（対象範囲・方針は未定。要ヒアリングのうえ別途確定する）

## 受け入れ条件

- [ ] frontend がローカルで `:5173` に起動し、HTTP応答を返す。
- [ ] functions が `:7071`、gateway が `:8787` でそれぞれ起動し、各サービスのHTTP疎通を確認できる。
- [ ] Azurite がローカルで起動し、対象サービスから接続できる。`http://127.0.0.1:10000` 等へ curl/SDK で接続確認する。
- [ ] frontend から必要なローカルサービスへの疎通を確認できる。
- [ ] ブラウザでローカルUIを開き、ページが表示されることを確認できる。
- [ ] ローカルデバッグ時に API キーを正しく受け渡す。
  - gateway 起動時に `OPENCODE_API_KEY`（pi 用キー env）を渡すこと。本番は `infra/agent-deploy.md:22,73` で注入済み。ローカルで未設定だと pi が `No API key` で拒否する（pi側の挙動。リポジトリ内に該当文言なし）。
    例: `cd agent` で `OPENCODE_API_KEY=<pi用キー> npm start`（PowerShell は `$env:OPENCODE_API_KEY="<pi用キー>"; npm start`）。
  - functions 側の `OPENCODE_GO_API_KEY` は有効な値にすること。未設定・無効キーの場合タイトル生成が失敗し 503 になる（`functions/src/functions/conversations.ts:127`）。値は `functions/local.settings.json` の `Values` に設定する（`README.md:251`、`functions/local.settings.json.example:11`）。
  - キー未設定時の扱い: `functions/src/services/opencodeGo.ts:133-135`（未設定なら throw）。
  - 参考（エラー応答の見え方）: `functions/src/functions/chat.ts:196-204`、`functions/src/services/agentGateway.ts:77-80,110`、`agent/src/server.ts:491-498`
